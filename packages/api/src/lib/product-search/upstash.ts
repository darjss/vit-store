import { type InferFilterFromSchema, Redis, s } from "@upstash/redis";
import {
	expandBrandAliases,
	expandSymptomIngredients,
	expandVitaminLetters,
	normalizeSearchText,
} from "~/lib/product-search/text";
import type {
	ProductSearchDocument,
	ProductSearchFilters,
	ProductSearchInput,
	ProductSearchPage,
	ProductSearchRebuildReason,
	ProductSearchSort,
	ProductSearchStatus,
	SearchProductResult,
} from "~/lib/product-search/types";

const PRODUCT_SEARCH_INDEX = "vit-products-v3";
const PRODUCT_KEY_PREFIX = "search:vit:v3:product:";
const ACTIVE_GENERATION_KEY = "search:vit:v3:active";
const STATUS_KEY = "search:vit:v3:status";
const REBUILD_LOCK_KEY = "search:vit:v3:rebuild-lock";
const WRITE_BATCH_SIZE = 50;
const STALE_GENERATION_TTL_SECONDS = 10 * 60;
const REBUILD_LOCK_TTL_MS = 30_000;
const REBUILD_LOCK_WAIT_MS = 10_000;

const PRODUCT_SEARCH_SCHEMA = s.object({
	generation: s.keyword(),
	id: s.number("I64"),
	name: s.string().noStem(),
	nameMn: s.string().noStem(),
	nameWithBrand: s.string().noStem(),
	nameMnWithBrand: s.string().noStem(),
	primaryName: s.string().noStem(),
	primaryNameMn: s.string().noStem(),
	description: s.string(),
	slug: s.keyword(),
	price: s.number("F64"),
	createdAt: s.keyword(),
	createdAtEpoch: s.number("I64"),
	discount: s.number("F64"),
	brand: s.string().noStem(),
	category: s.string().noStem(),
	status: s.keyword(),
	stock: s.number("I64"),
	inStock: s.boolean().fast(),
	amount: s.string().noStem(),
	potency: s.string().noStem(),
	dosage: s.string().noStem(),
	dailyIntake: s.number("I64"),
	brandId: s.number("I64"),
	categoryId: s.number("I64"),
	isFeatured: s.boolean().fast(),
	image: s.keyword(),
	hasImage: s.boolean().fast(),
	ingredientPreviewJson: s.keyword(),
	ingredients: s.string().noStem(),
	tags: s.string().noStem(),
	aliases: s.string().noStem(),
	intentTerms: s.string().noStem(),
	rankingScore: s.number("F64"),
});

type ProductSearchFilter = InferFilterFromSchema<typeof PRODUCT_SEARCH_SCHEMA>;
type ProductSearchClause = Extract<
	ProductSearchFilter,
	{ $must: unknown }
>["$must"] extends infer Must
	? Must extends readonly (infer Clause)[]
		? Clause
		: Must
	: never;
type IndexedProductSearchDocument = ProductSearchDocument & {
	generation: string;
};

type ActiveGeneration = {
	generation: string;
	productCount: number;
	generatedAt: string;
};

export type ProductSearchNamespace = {
	indexName: string;
	productKeyPrefix: string;
	activeGenerationKey: string;
	statusKey: string;
	rebuildLockKey: string;
};

const productionNamespace: ProductSearchNamespace = {
	indexName: PRODUCT_SEARCH_INDEX,
	productKeyPrefix: PRODUCT_KEY_PREFIX,
	activeGenerationKey: ACTIVE_GENERATION_KEY,
	statusKey: STATUS_KEY,
	rebuildLockKey: REBUILD_LOCK_KEY,
};

const emptyStatus = (): ProductSearchStatus => ({
	initialized: false,
	activeGeneration: null,
	productCount: 0,
	generatedAt: null,
	lastRebuildStartedAt: null,
	lastRebuildFinishedAt: null,
	lastRebuildReason: null,
	lastError: null,
});

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : "Unknown error";

const readJson = <T>(redis: Redis, key: string) => redis.get<T>(key);

const wait = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds));

export const withProductSearchRebuildLock = async <T>(
	redis: Redis,
	operation: () => Promise<T>,
	namespace: ProductSearchNamespace = productionNamespace,
) => {
	const token = crypto.randomUUID();
	const deadline = Date.now() + REBUILD_LOCK_WAIT_MS;
	while (
		(await redis.set(namespace.rebuildLockKey, token, {
			nx: true,
			px: REBUILD_LOCK_TTL_MS,
		})) !== "OK"
	) {
		if (Date.now() >= deadline) {
			throw new Error("Timed out waiting for the product search rebuild lock");
		}
		await wait(100);
	}

	try {
		return await operation();
	} finally {
		await redis
			.eval(
				"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
				[namespace.rebuildLockKey],
				[token],
			)
			.catch(() => undefined);
	}
};

const prepareQuery = (query: string) => {
	const normalized = normalizeSearchText(query);
	const brandExpanded = expandBrandAliases(normalized) || normalized;
	const vitaminExpanded = expandVitaminLetters(brandExpanded) || brandExpanded;
	const phrase = normalizeSearchText(vitaminExpanded);
	const tokens = Array.from(new Set(phrase.split(" ").filter(Boolean)));
	return { phrase, tokens };
};

const exactTokenFilter = (
	token: string,
	includeIntent: boolean,
	includeBroadFields: boolean,
): ProductSearchClause => ({
	$should: [
		{ primaryName: { $eq: token, $boost: 18 } },
		{ primaryNameMn: { $eq: token, $boost: 18 } },
		{ brand: { $eq: token } },
		{ dosage: { $eq: token } },
		{ aliases: { $eq: token } },
		...(includeIntent ? [{ intentTerms: { $eq: token } }] : []),
		...(includeBroadFields
			? [
					{ nameWithBrand: { $eq: token } },
					{ nameMnWithBrand: { $eq: token } },
					{ category: { $eq: token } },
					{ ingredients: { $eq: token } },
					{ tags: { $eq: token } },
				]
			: []),
	],
});

const prefixTokenFilter = (
	token: string,
	includeIntent: boolean,
	includeBroadFields: boolean,
): ProductSearchClause => ({
	$should: [
		{ primaryName: { $phrase: { value: token, prefix: true }, $boost: 18 } },
		{
			primaryNameMn: { $phrase: { value: token, prefix: true }, $boost: 18 },
		},
		{ brand: { $phrase: { value: token, prefix: true }, $boost: 9 } },
		{ dosage: { $phrase: { value: token, prefix: true }, $boost: 9 } },
		{ aliases: { $phrase: { value: token, prefix: true }, $boost: 7 } },
		...(includeIntent
			? [{ intentTerms: { $phrase: { value: token, prefix: true } } }]
			: []),
		...(includeBroadFields
			? [
					{ nameWithBrand: { $phrase: { value: token, prefix: true } } },
					{ nameMnWithBrand: { $phrase: { value: token, prefix: true } } },
					{ category: { $phrase: { value: token, prefix: true } } },
					{ ingredients: { $phrase: { value: token, prefix: true } } },
					{ tags: { $phrase: { value: token, prefix: true } } },
				]
			: []),
	],
});

const smartTokenFilter = (
	token: string,
	includeIntent: boolean,
	includeBroadFields: boolean,
): ProductSearchClause => ({
	$should: [
		{ primaryName: { $smart: token, $boost: 18 } },
		{ primaryNameMn: { $smart: token, $boost: 18 } },
		{ brand: { $smart: token, $boost: 9 } },
		{ aliases: { $smart: token, $boost: 7 } },
		...(includeIntent ? [{ intentTerms: { $smart: token } }] : []),
		...(includeBroadFields
			? [
					{ nameWithBrand: { $smart: token } },
					{ nameMnWithBrand: { $smart: token } },
					{ category: { $smart: token } },
					{ ingredients: { $smart: token } },
					{ tags: { $smart: token } },
					{ description: { $smart: token } },
				]
			: []),
	],
});

export const buildProductSearchFilter = (
	query: string,
	generation: string,
	filters?: ProductSearchFilters,
	matchScope: "direct" | "broad" = "direct",
): ProductSearchFilter => {
	const { phrase, tokens } = prepareQuery(query);
	const symptomIngredients = expandSymptomIngredients(query);
	const symptomBoosts: ProductSearchClause[] = symptomIngredients.flatMap(
		(term, index) => {
			const boost = Math.max(16 - index * 2, 6);
			return [
				{ nameWithBrand: { $smart: term, $boost: boost } },
				{ nameMnWithBrand: { $smart: term, $boost: boost } },
				{ aliases: { $smart: term, $boost: boost - 2 } },
			];
		},
	);
	const includeIntent = symptomIngredients.length > 0;
	const includeBroadFields = matchScope === "broad";
	const must: ProductSearchClause[] = [
		{ generation: { $eq: generation } },
		{ status: { $eq: "active" } },
		...tokens.map((token) => {
			if (token.length <= 1 || /^\d+$/.test(token)) {
				return exactTokenFilter(token, includeIntent, includeBroadFields);
			}
			return token.length <= 3
				? prefixTokenFilter(token, includeIntent, includeBroadFields)
				: smartTokenFilter(token, includeIntent, includeBroadFields);
		}),
	];

	if (filters?.brandId != null) {
		must.push({ brandId: { $eq: filters.brandId } });
	}
	if (filters?.categoryId != null) {
		must.push({ categoryId: { $eq: filters.categoryId } });
	}
	if (filters?.requireStock) {
		must.push({ inStock: { $eq: true } }, { stock: { $gt: 0 } });
	}
	if (filters?.minPrice != null) {
		must.push({ price: { $gte: filters.minPrice } });
	}
	if (filters?.maxPrice != null) {
		must.push({ price: { $lte: filters.maxPrice } });
	}

	if (!includeIntent) return { $must: must };

	return {
		$must: must,
		$should: [
			{
				primaryName: { $phrase: { value: phrase, slop: 0 }, $boost: 32 },
			},
			{
				primaryNameMn: {
					$phrase: { value: phrase, slop: 0 },
					$boost: 32,
				},
			},
			{
				nameWithBrand: { $phrase: { value: phrase, slop: 0 }, $boost: 24 },
			},
			{
				nameMnWithBrand: {
					$phrase: { value: phrase, slop: 0 },
					$boost: 24,
				},
			},
			{ brand: { $phrase: { value: phrase, slop: 0 }, $boost: 14 } },
			{ dosage: { $phrase: { value: phrase, slop: 0 }, $boost: 14 } },
			{ aliases: { $phrase: { value: phrase, slop: 0 }, $boost: 10 } },
			...symptomBoosts,
		],
	};
};

const ingredientPreview = (value: string) => {
	const parsed: unknown = JSON.parse(value);
	return Array.isArray(parsed)
		? parsed.filter((item): item is string => typeof item === "string")
		: [];
};

const toSearchResult = (
	document: IndexedProductSearchDocument,
): SearchProductResult => ({
	id: document.id,
	name: document.name,
	nameMn: document.nameMn || undefined,
	slug: document.slug,
	price: document.price,
	createdAt: document.createdAt,
	discount: document.discount,
	brand: document.brand,
	category: document.category,
	status: document.status,
	stock: document.stock,
	inStock: document.inStock,
	amount: document.amount,
	potency: document.potency,
	dailyIntake: document.dailyIntake,
	brandId: document.brandId >= 0 ? document.brandId : undefined,
	categoryId: document.categoryId >= 0 ? document.categoryId : undefined,
	isFeatured: document.isFeatured,
	image: document.image,
	hasImage: document.hasImage,
	ingredientPreview: ingredientPreview(document.ingredientPreviewJson),
});

const queryIndex = (
	redis: Redis,
	namespace: ProductSearchNamespace,
	filter: ProductSearchFilter,
	pageSize: number,
	offset: number,
	rankByDemand: boolean,
	sort?: ProductSearchSort,
) => {
	const index = redis.search.index({
		name: namespace.indexName,
		schema: PRODUCT_SEARCH_SCHEMA,
	});
	const base = { filter, limit: pageSize, offset };
	if (sort?.field === "price") {
		return index.query({
			...base,
			orderBy: { price: sort.direction === "asc" ? "ASC" : "DESC" },
		});
	}
	if (sort?.field === "createdAt") {
		return index.query({
			...base,
			orderBy: {
				createdAtEpoch: sort.direction === "asc" ? "ASC" : "DESC",
			},
		});
	}
	if (!rankByDemand) return index.query(base);
	return index.query({
		...base,
		scoreFunc: {
			field: "rankingScore",
			scoreMode: "replace",
		},
	});
};

const scanProductKeys = async (
	redis: Redis,
	namespace: ProductSearchNamespace,
) => {
	const keys: string[] = [];
	let cursor = 0;
	do {
		const [nextCursor, page] = await redis.scan(cursor, {
			match: `${namespace.productKeyPrefix}*`,
			count: 500,
		});
		keys.push(...page);
		cursor = Number(nextCursor);
	} while (cursor !== 0);
	return keys;
};

const writeGeneration = async (
	redis: Redis,
	namespace: ProductSearchNamespace,
	documents: ProductSearchDocument[],
	generation: string,
) => {
	for (let offset = 0; offset < documents.length; offset += WRITE_BATCH_SIZE) {
		const pipeline = redis.pipeline();
		for (const document of documents.slice(offset, offset + WRITE_BATCH_SIZE)) {
			const indexed: IndexedProductSearchDocument = {
				...document,
				generation,
			};
			pipeline.set(
				`${namespace.productKeyPrefix}${generation}:${document.id}`,
				JSON.stringify(indexed),
			);
		}
		await pipeline.exec();
	}
};

const expireStaleGenerations = async (
	redis: Redis,
	namespace: ProductSearchNamespace,
	activeGeneration: string,
) => {
	const staleKeys = (await scanProductKeys(redis, namespace)).filter(
		(key) =>
			!key.startsWith(`${namespace.productKeyPrefix}${activeGeneration}:`),
	);
	for (let offset = 0; offset < staleKeys.length; offset += WRITE_BATCH_SIZE) {
		const pipeline = redis.pipeline();
		for (const key of staleKeys.slice(offset, offset + WRITE_BATCH_SIZE)) {
			pipeline.expire(key, STALE_GENERATION_TTL_SECONDS);
		}
		await pipeline.exec();
	}
};

export const createProductSearchEngine = (
	redis: Redis,
	namespace: ProductSearchNamespace = productionNamespace,
) => {
	const index = () =>
		redis.search.index({
			name: namespace.indexName,
			schema: PRODUCT_SEARCH_SCHEMA,
		});

	return {
		async search(input: ProductSearchInput): Promise<ProductSearchPage> {
			const query = input.query.trim();
			const page = Math.max(input.page ?? 1, 1);
			const pageSize = Math.min(Math.max(input.pageSize ?? 10, 1), 100);
			if (!query) {
				return {
					items: [],
					pagination: {
						page,
						pageSize,
						totalCount: 0,
						totalPages: 0,
						hasNextPage: false,
						hasPreviousPage: false,
					},
				};
			}

			const active = await readJson<ActiveGeneration>(
				redis,
				namespace.activeGenerationKey,
			);
			if (!active) throw new Error("Product search index is not initialized");

			const offset = (page - 1) * pageSize;
			const rankByDemand = expandSymptomIngredients(query).length === 0;
			const runQuery = async (
				filter: ProductSearchFilter,
				useDemandRank: boolean,
			) => {
				const [hits, { count }] = await Promise.all([
					queryIndex(
						redis,
						namespace,
						filter,
						pageSize,
						offset,
						useDemandRank,
						input.sort,
					),
					index().count({ filter }),
				]);
				return { hits, count };
			};

			const directFilter = buildProductSearchFilter(
				query,
				active.generation,
				input.filters,
			);
			let result = await runQuery(directFilter, rankByDemand);
			if (result.count === 0 && rankByDemand) {
				const broadFilter = buildProductSearchFilter(
					query,
					active.generation,
					input.filters,
					"broad",
				);
				result = await runQuery(broadFilter, false);
			}
			const totalPages = Math.ceil(result.count / pageSize);

			return {
				items: result.hits.map((hit) => toSearchResult(hit.data)),
				pagination: {
					page,
					pageSize,
					totalCount: result.count,
					totalPages,
					hasNextPage: page < totalPages,
					hasPreviousPage: page > 1 && result.count > 0,
				},
			};
		},

		async replaceAll(
			documents: ProductSearchDocument[],
			reason: ProductSearchRebuildReason,
		): Promise<ProductSearchStatus> {
			const startedAt = new Date().toISOString();
			const previousStatus =
				(await readJson<ProductSearchStatus>(redis, namespace.statusKey)) ??
				emptyStatus();
			await redis.set(
				namespace.statusKey,
				JSON.stringify({
					...previousStatus,
					lastRebuildStartedAt: startedAt,
					lastRebuildReason: reason,
					lastError: null,
				}),
			);

			const generation = crypto.randomUUID();
			try {
				await redis.search.createIndex({
					name: namespace.indexName,
					schema: PRODUCT_SEARCH_SCHEMA,
					dataType: "string",
					prefix: namespace.productKeyPrefix,
					existsOk: true,
				});

				await writeGeneration(redis, namespace, documents, generation);
				await index().waitIndexing();

				const generationFilter: ProductSearchFilter = {
					$must: [
						{ generation: { $eq: generation } },
						{ status: { $eq: "active" } },
					],
				};
				const { count } = await index().count({ filter: generationFilter });
				if (count !== documents.length) {
					throw new Error(
						`Product search indexed ${count} of ${documents.length} products`,
					);
				}

				const finishedAt = new Date().toISOString();
				const active: ActiveGeneration = {
					generation,
					productCount: count,
					generatedAt: finishedAt,
				};
				const status: ProductSearchStatus = {
					initialized: true,
					activeGeneration: generation,
					productCount: count,
					generatedAt: finishedAt,
					lastRebuildStartedAt: startedAt,
					lastRebuildFinishedAt: finishedAt,
					lastRebuildReason: reason,
					lastError: null,
				};
				const transaction = redis.multi();
				transaction.set(namespace.activeGenerationKey, JSON.stringify(active));
				transaction.set(namespace.statusKey, JSON.stringify(status));
				await transaction.exec();

				try {
					await expireStaleGenerations(redis, namespace, generation);
					return status;
				} catch (cleanupError) {
					const degradedStatus = {
						...status,
						lastError: `Stale index cleanup pending: ${errorMessage(cleanupError)}`,
					};
					await redis
						.set(namespace.statusKey, JSON.stringify(degradedStatus))
						.catch(() => undefined);
					return degradedStatus;
				}
			} catch (error) {
				const failedStatus: ProductSearchStatus = {
					...previousStatus,
					lastRebuildStartedAt: startedAt,
					lastRebuildFinishedAt: new Date().toISOString(),
					lastRebuildReason: reason,
					lastError: errorMessage(error),
				};
				await redis
					.set(namespace.statusKey, JSON.stringify(failedStatus))
					.catch(() => undefined);
				throw error;
			}
		},

		async getStatus() {
			return (
				(await readJson<ProductSearchStatus>(redis, namespace.statusKey)) ??
				emptyStatus()
			);
		},
	};
};

export const createProductSearchRedis = (url: string, token: string) =>
	new Redis({
		url,
		token,
		signal: () => AbortSignal.timeout(4_000),
	});

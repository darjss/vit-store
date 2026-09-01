import { type InferFilterFromSchema, Redis, s } from "@upstash/redis";
import * as v from "valibot";
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
import { thrownErrorWireSchema } from "~/lib/logging";

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
	aliases: s.string().noStem(),
	amount: s.string().noStem(),
	brand: s.string().noStem(),
	brandId: s.number("I64"),
	category: s.string().noStem(),
	categoryId: s.number("I64"),
	createdAt: s.keyword(),
	createdAtEpoch: s.number("I64"),
	dailyIntake: s.number("I64"),
	description: s.string(),
	discount: s.number("F64"),
	dosage: s.string().noStem(),
	generation: s.keyword(),
	hasImage: s.boolean().fast(),
	id: s.number("I64"),
	image: s.keyword(),
	ingredientPreviewJson: s.keyword(),
	ingredients: s.string().noStem(),
	inStock: s.boolean().fast(),
	intentTerms: s.string().noStem(),
	isFeatured: s.boolean().fast(),
	name: s.string().noStem(),
	nameMn: s.string().noStem(),
	nameMnWithBrand: s.string().noStem(),
	nameWithBrand: s.string().noStem(),
	potency: s.string().noStem(),
	price: s.number("F64"),
	primaryName: s.string().noStem(),
	primaryNameMn: s.string().noStem(),
	rankingScore: s.number("F64"),
	slug: s.keyword(),
	status: s.keyword(),
	stock: s.number("I64"),
	tags: s.string().noStem(),
});

type ProductSearchFilter = InferFilterFromSchema<typeof PRODUCT_SEARCH_SCHEMA>;
type ProductSearchClause = Extract<
	ProductSearchFilter,
	{ $must: unknown }
>["$must"] extends infer Must
	? Must extends ReadonlyArray<infer Clause>
		? Clause
		: Must
	: never;
type IndexedProductSearchDocument = ProductSearchDocument & {
	generation: string;
};

type ActiveGeneration = {
	generatedAt: string;
	generation: string;
	productCount: number;
};

export type ProductSearchNamespace = {
	activeGenerationKey: string;
	indexName: string;
	productKeyPrefix: string;
	rebuildLockKey: string;
	statusKey: string;
};

const productionNamespace: ProductSearchNamespace = {
	activeGenerationKey: ACTIVE_GENERATION_KEY,
	indexName: PRODUCT_SEARCH_INDEX,
	productKeyPrefix: PRODUCT_KEY_PREFIX,
	rebuildLockKey: REBUILD_LOCK_KEY,
	statusKey: STATUS_KEY,
};

const emptyStatus = (): ProductSearchStatus => ({
	activeGeneration: null,
	generatedAt: null,
	initialized: false,
	lastError: null,
	lastRebuildFinishedAt: null,
	lastRebuildReason: null,
	lastRebuildStartedAt: null,
	productCount: 0,
});

const errorMessage = (error: v.InferOutput<typeof thrownErrorWireSchema>) =>
	error instanceof Error ? error.message : "Unknown error";

const readJson = <T>(redis: Redis, key: string) => redis.get<T>(key);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
		{ primaryName: { $boost: 18, $eq: token } },
		{ primaryNameMn: { $boost: 18, $eq: token } },
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
		{ primaryName: { $boost: 18, $phrase: { prefix: true, value: token } } },
		{
			primaryNameMn: { $boost: 18, $phrase: { prefix: true, value: token } },
		},
		{ brand: { $boost: 9, $phrase: { prefix: true, value: token } } },
		{ dosage: { $boost: 9, $phrase: { prefix: true, value: token } } },
		{ aliases: { $boost: 7, $phrase: { prefix: true, value: token } } },
		...(includeIntent ? [{ intentTerms: { $phrase: { prefix: true, value: token } } }] : []),
		...(includeBroadFields
			? [
					{ nameWithBrand: { $phrase: { prefix: true, value: token } } },
					{ nameMnWithBrand: { $phrase: { prefix: true, value: token } } },
					{ category: { $phrase: { prefix: true, value: token } } },
					{ ingredients: { $phrase: { prefix: true, value: token } } },
					{ tags: { $phrase: { prefix: true, value: token } } },
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
		{ primaryName: { $boost: 18, $smart: token } },
		{ primaryNameMn: { $boost: 18, $smart: token } },
		{ brand: { $boost: 9, $smart: token } },
		{ aliases: { $boost: 7, $smart: token } },
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
	const symptomBoosts: Array<ProductSearchClause> = symptomIngredients.flatMap((term, index) => {
		const boost = Math.max(16 - index * 2, 6);
		return [
			{ nameWithBrand: { $boost: boost, $smart: term } },
			{ nameMnWithBrand: { $boost: boost, $smart: term } },
			{ aliases: { $boost: boost - 2, $smart: term } },
		];
	});
	const includeIntent = symptomIngredients.length > 0;
	const includeBroadFields = matchScope === "broad";
	const must: Array<ProductSearchClause> = [
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

	if (!includeIntent) {
		return { $must: must };
	}

	return {
		$must: must,
		$should: [
			{
				primaryName: { $boost: 32, $phrase: { slop: 0, value: phrase } },
			},
			{
				primaryNameMn: {
					$boost: 32,
					$phrase: { slop: 0, value: phrase },
				},
			},
			{
				nameWithBrand: { $boost: 24, $phrase: { slop: 0, value: phrase } },
			},
			{
				nameMnWithBrand: {
					$boost: 24,
					$phrase: { slop: 0, value: phrase },
				},
			},
			{ brand: { $boost: 14, $phrase: { slop: 0, value: phrase } } },
			{ dosage: { $boost: 14, $phrase: { slop: 0, value: phrase } } },
			{ aliases: { $boost: 10, $phrase: { slop: 0, value: phrase } } },
			...symptomBoosts,
		],
	};
};

const ingredientPreviewSchema = v.array(v.string());

const ingredientPreview = (value: string) => {
	const parsed = v.safeParse(ingredientPreviewSchema, JSON.parse(value));
	return parsed.success ? parsed.output : [];
};

const toSearchResult = (document: IndexedProductSearchDocument): SearchProductResult => ({
	amount: document.amount,
	brand: document.brand,
	brandId: document.brandId >= 0 ? document.brandId : undefined,
	category: document.category,
	categoryId: document.categoryId >= 0 ? document.categoryId : undefined,
	createdAt: document.createdAt,
	dailyIntake: document.dailyIntake,
	discount: document.discount,
	hasImage: document.hasImage,
	id: document.id,
	image: document.image,
	ingredientPreview: ingredientPreview(document.ingredientPreviewJson),
	inStock: document.inStock,
	isFeatured: document.isFeatured,
	name: document.name,
	nameMn: document.nameMn || undefined,
	potency: document.potency,
	price: document.price,
	slug: document.slug,
	status: document.status,
	stock: document.stock,
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
	if (!rankByDemand) {
		return index.query(base);
	}
	return index.query({
		...base,
		scoreFunc: {
			field: "rankingScore",
			scoreMode: "replace",
		},
	});
};

const scanProductKeys = async (redis: Redis, namespace: ProductSearchNamespace) => {
	const keys: Array<string> = [];
	let cursor = 0;
	do {
		const [nextCursor, page] = await redis.scan(cursor, {
			count: 500,
			match: `${namespace.productKeyPrefix}*`,
		});
		keys.push(...page);
		cursor = Number(nextCursor);
	} while (cursor !== 0);
	return keys;
};

const writeGeneration = async (
	redis: Redis,
	namespace: ProductSearchNamespace,
	documents: Array<ProductSearchDocument>,
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
		(key) => !key.startsWith(`${namespace.productKeyPrefix}${activeGeneration}:`),
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
		async getStatus() {
			return (await readJson<ProductSearchStatus>(redis, namespace.statusKey)) ?? emptyStatus();
		},

		async replaceAll(
			documents: Array<ProductSearchDocument>,
			reason: ProductSearchRebuildReason,
		): Promise<ProductSearchStatus> {
			const startedAt = new Date().toISOString();
			const previousStatus =
				(await readJson<ProductSearchStatus>(redis, namespace.statusKey)) ?? emptyStatus();
			await redis.set(
				namespace.statusKey,
				JSON.stringify({
					...previousStatus,
					lastError: null,
					lastRebuildReason: reason,
					lastRebuildStartedAt: startedAt,
				}),
			);

			const generation = crypto.randomUUID();
			try {
				await redis.search.createIndex({
					dataType: "string",
					existsOk: true,
					name: namespace.indexName,
					prefix: namespace.productKeyPrefix,
					schema: PRODUCT_SEARCH_SCHEMA,
				});

				await writeGeneration(redis, namespace, documents, generation);
				await index().waitIndexing();

				const generationFilter: ProductSearchFilter = {
					$must: [{ generation: { $eq: generation } }, { status: { $eq: "active" } }],
				};
				const { count } = await index().count({ filter: generationFilter });
				if (count !== documents.length) {
					throw new Error(`Product search indexed ${count} of ${documents.length} products`);
				}

				const finishedAt = new Date().toISOString();
				const active: ActiveGeneration = {
					generatedAt: finishedAt,
					generation,
					productCount: count,
				};
				const status: ProductSearchStatus = {
					activeGeneration: generation,
					generatedAt: finishedAt,
					initialized: true,
					lastError: null,
					lastRebuildFinishedAt: finishedAt,
					lastRebuildReason: reason,
					lastRebuildStartedAt: startedAt,
					productCount: count,
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
						lastError: `Stale index cleanup pending: ${errorMessage(v.parse(thrownErrorWireSchema, cleanupError))}`,
					};
					await redis
						.set(namespace.statusKey, JSON.stringify(degradedStatus))
						.catch(() => undefined);
					return degradedStatus;
				}
			} catch (error) {
				const failedStatus: ProductSearchStatus = {
					...previousStatus,
					lastError: errorMessage(v.parse(thrownErrorWireSchema, error)),
					lastRebuildFinishedAt: new Date().toISOString(),
					lastRebuildReason: reason,
					lastRebuildStartedAt: startedAt,
				};
				await redis.set(namespace.statusKey, JSON.stringify(failedStatus)).catch(() => undefined);
				throw error;
			}
		},

		async search(input: ProductSearchInput): Promise<ProductSearchPage> {
			const query = input.query.trim();
			const page = Math.max(input.page ?? 1, 1);
			const pageSize = Math.min(Math.max(input.pageSize ?? 10, 1), 100);
			if (!query) {
				return {
					items: [],
					pagination: {
						hasNextPage: false,
						hasPreviousPage: false,
						page,
						pageSize,
						totalCount: 0,
						totalPages: 0,
					},
				};
			}

			const active = await readJson<ActiveGeneration>(redis, namespace.activeGenerationKey);
			if (!active) {
				throw new Error("Product search index is not initialized");
			}

			const offset = (page - 1) * pageSize;
			const rankByDemand = expandSymptomIngredients(query).length === 0;
			const runQuery = async (filter: ProductSearchFilter, useDemandRank: boolean) => {
				const [hits, { count }] = await Promise.all([
					queryIndex(redis, namespace, filter, pageSize, offset, useDemandRank, input.sort),
					index().count({ filter }),
				]);
				return { count, hits };
			};

			const directFilter = buildProductSearchFilter(query, active.generation, input.filters);
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
					hasNextPage: page < totalPages,
					hasPreviousPage: page > 1 && result.count > 0,
					page,
					pageSize,
					totalCount: result.count,
					totalPages,
				},
			};
		},
	};
};

export const createProductSearchRedis = (url: string, token: string) =>
	new Redis({
		signal: () => AbortSignal.timeout(4000),
		token,
		url,
	});

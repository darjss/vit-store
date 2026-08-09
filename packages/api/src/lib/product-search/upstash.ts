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

const PRODUCT_SEARCH_INDEX = "vit-products-v2";
const PRODUCT_KEY_PREFIX = "search:vit:v2:product:";
const ACTIVE_GENERATION_KEY = "search:vit:v2:active";
const STATUS_KEY = "search:vit:v2:status";
const WRITE_BATCH_SIZE = 50;
const STALE_GENERATION_TTL_SECONDS = 10 * 60;

const PRODUCT_SEARCH_SCHEMA = s.object({
	generation: s.keyword(),
	id: s.number("I64"),
	name: s.string().noStem(),
	nameMn: s.string().noStem(),
	nameWithBrand: s.string().noStem(),
	nameMnWithBrand: s.string().noStem(),
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
};

const productionNamespace: ProductSearchNamespace = {
	indexName: PRODUCT_SEARCH_INDEX,
	productKeyPrefix: PRODUCT_KEY_PREFIX,
	activeGenerationKey: ACTIVE_GENERATION_KEY,
	statusKey: STATUS_KEY,
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

const prepareQuery = (query: string) => {
	const normalized = normalizeSearchText(query);
	const brandExpanded = expandBrandAliases(normalized) || normalized;
	const vitaminExpanded = expandVitaminLetters(brandExpanded) || brandExpanded;
	const tokens = Array.from(
		new Set(normalizeSearchText(vitaminExpanded).split(" ").filter(Boolean)),
	);
	return { normalized, tokens };
};

const exactTokenFilter = (token: string): ProductSearchClause => ({
	$should: [
		{ nameWithBrand: { $eq: token } },
		{ nameMnWithBrand: { $eq: token } },
		{ brand: { $eq: token } },
		{ category: { $eq: token } },
		{ dosage: { $eq: token } },
		{ aliases: { $eq: token } },
		{ intentTerms: { $eq: token } },
		{ ingredients: { $eq: token } },
		{ tags: { $eq: token } },
	],
});

const prefixTokenFilter = (token: string): ProductSearchClause => ({
	$should: [
		{ nameWithBrand: { $phrase: { value: token, prefix: true }, $boost: 12 } },
		{
			nameMnWithBrand: { $phrase: { value: token, prefix: true }, $boost: 12 },
		},
		{ brand: { $phrase: { value: token, prefix: true }, $boost: 9 } },
		{ dosage: { $phrase: { value: token, prefix: true }, $boost: 9 } },
		{ aliases: { $phrase: { value: token, prefix: true }, $boost: 7 } },
		{ category: { $phrase: { value: token, prefix: true }, $boost: 4 } },
		{ intentTerms: { $phrase: { value: token, prefix: true }, $boost: 3 } },
		{ tags: { $phrase: { value: token, prefix: true }, $boost: 2 } },
	],
});

const smartTokenFilter = (token: string): ProductSearchClause => ({
	$should: [
		{ nameWithBrand: { $smart: token, $boost: 12 } },
		{ nameMnWithBrand: { $smart: token, $boost: 12 } },
		{ brand: { $smart: token, $boost: 9 } },
		{ dosage: { $smart: token, $boost: 9 } },
		{ aliases: { $smart: token, $boost: 7 } },
		{ category: { $smart: token, $boost: 4 } },
		{ intentTerms: { $smart: token, $boost: 3 } },
		{ ingredients: { $smart: token, $boost: 2 } },
		{ tags: { $smart: token, $boost: 2 } },
		{ description: { $smart: token, $boost: 0.5 } },
	],
});

export const buildProductSearchFilter = (
	query: string,
	generation: string,
	filters?: ProductSearchFilters,
): ProductSearchFilter => {
	const { normalized, tokens } = prepareQuery(query);
	const symptomBoosts: ProductSearchClause[] = expandSymptomIngredients(
		query,
	).flatMap((term, index) => {
		const boost = Math.max(16 - index * 2, 6);
		return [
			{ nameWithBrand: { $smart: term, $boost: boost } },
			{ nameMnWithBrand: { $smart: term, $boost: boost } },
			{ aliases: { $smart: term, $boost: boost - 2 } },
		];
	});
	const must: ProductSearchClause[] = [
		{ generation: { $eq: generation } },
		{ status: { $eq: "active" } },
		...tokens.map((token) => {
			if (token.length <= 1 || /^\d+$/.test(token)) {
				return exactTokenFilter(token);
			}
			return token.length <= 3
				? prefixTokenFilter(token)
				: smartTokenFilter(token);
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

	return {
		$must: must,
		$should: [
			{
				nameWithBrand: { $phrase: { value: normalized, slop: 0 }, $boost: 24 },
			},
			{
				nameMnWithBrand: {
					$phrase: { value: normalized, slop: 0 },
					$boost: 24,
				},
			},
			{ brand: { $phrase: { value: normalized, slop: 0 }, $boost: 14 } },
			{ dosage: { $phrase: { value: normalized, slop: 0 }, $boost: 14 } },
			{ aliases: { $phrase: { value: normalized, slop: 0 }, $boost: 10 } },
			...symptomBoosts,
			{ inStock: { $eq: true, $boost: 1.05 } },
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
	return index.query(base);
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

			const filter = buildProductSearchFilter(
				query,
				active.generation,
				input.filters,
			);
			const offset = (page - 1) * pageSize;
			const [hits, { count: totalCount }] = await Promise.all([
				queryIndex(redis, namespace, filter, pageSize, offset, input.sort),
				index().count({ filter }),
			]);
			const totalPages = Math.ceil(totalCount / pageSize);

			return {
				items: hits.map((hit) => toSearchResult(hit.data)),
				pagination: {
					page,
					pageSize,
					totalCount,
					totalPages,
					hasNextPage: page < totalPages,
					hasPreviousPage: page > 1 && totalCount > 0,
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

		async clear() {
			await redis.del(namespace.activeGenerationKey);
			const keys = await scanProductKeys(redis, namespace);
			for (let offset = 0; offset < keys.length; offset += WRITE_BATCH_SIZE) {
				await redis.del(...keys.slice(offset, offset + WRITE_BATCH_SIZE));
			}
			await Promise.all([redis.del(namespace.statusKey), index().drop()]);
		},
	};
};

export const createProductSearchRedis = (url: string, token: string) =>
	new Redis({
		url,
		token,
		signal: () => AbortSignal.timeout(4_000),
	});

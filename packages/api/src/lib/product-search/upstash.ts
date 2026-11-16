import { type InferFilterFromSchema, Redis, s } from "@upstash/redis";
import * as v from "valibot";
import {
	expandSymptomIngredients,
	normalizeSearchText,
	parseSearchQuery,
	searchSpellings,
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

const PRODUCT_SEARCH_INDEX = "vit-products-v4";
const PRODUCT_KEY_PREFIX = "search:vit:v4:product:";
const ACTIVE_GENERATION_KEY = "search:vit:v4:active";
const STATUS_KEY = "search:vit:v4:status";
const REBUILD_LOCK_KEY = "search:vit:v4:rebuild-lock";
const WRITE_BATCH_SIZE = 50;
const STALE_GENERATION_TTL_SECONDS = 10 * 60;
const REBUILD_LOCK_TTL_MS = 30_000;
const REBUILD_LOCK_WAIT_MS = 10_000;
// Below this many direct matches, the broad pass also runs.
const MIN_DIRECT_RESULTS = 3;
// The relaxed pass ranks this many candidates, then keeps those with most words.
const RELAXED_POOL_SIZE = 100;
// A relaxed match needs one word found in at most this share of the catalog.
const RELAXED_RARE_SHARE = 0.1;

const PRODUCT_SEARCH_SCHEMA = s.object({
	aliases: s.string().noStem(),
	amount: s.string().noStem(),
	brand: s.string().noStem(),
	brandId: s.number("I64"),
	category: s.string().noStem(),
	categoryId: s.number("I64"),
	compareAtPrice: s.number("F64"),
	createdAt: s.keyword(),
	createdAtEpoch: s.number("I64"),
	dailyIntake: s.number("I64"),
	description: s.string(),
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

type MatchScope = "direct" | "broad" | "relaxed";

type TextMatch =
	| { $eq: string }
	| { $phrase: { prefix: true; value: string } }
	| { $smart: string }
	| { $fuzzy: { distance: 2; transpositionCostOne: true; value: string } };

const fieldMatches = (
	match: TextMatch,
	includeIntent: boolean,
	includeBroadFields: boolean,
): Array<ProductSearchClause> => [
	{ primaryName: { $boost: 18, ...match } },
	{ primaryNameMn: { $boost: 18, ...match } },
	{ brand: { $boost: 9, ...match } },
	// Dosage text often lists secondary ingredients, so it takes only exact and prefix matches.
	...("$eq" in match || "$phrase" in match ? [{ dosage: { $boost: 9, ...match } }] : []),
	{ aliases: { $boost: 7, ...match } },
	...(includeIntent ? [{ intentTerms: match }] : []),
	...(includeBroadFields
		? [
				{ nameWithBrand: match },
				{ nameMnWithBrand: match },
				{ category: match },
				{ ingredients: match },
				{ tags: match },
				...("$smart" in match ? [{ description: match }] : []),
			]
		: []),
];

/**
 * The last word is still being typed, so it matches as a prefix at any length.
 * Other words: a lone letter or a number is exact, 2 to 3 letters a prefix,
 * longer words `$smart`. Outside the direct pass, long words also tolerate two
 * typos, so "isonitol" finds inositol.
 */
const spellingMatches = (token: string, isLast: boolean, scope: MatchScope) => {
	const isNumber = /^\d+$/u.test(token);
	const exact = token.length === 1 || isNumber;
	const matches: Array<TextMatch> = [];
	if (isLast || (!exact && token.length <= 3)) {
		matches.push({ $phrase: { prefix: true, value: token } });
	} else if (exact) {
		matches.push({ $eq: token });
	}
	if (token.length >= 4 && !isNumber) {
		matches.push({ $smart: token });
	}
	if (scope !== "direct" && token.length >= 7) {
		matches.push({ $fuzzy: { distance: 2, transpositionCostOne: true, value: token } });
	}
	return matches;
};

const tokenFilter = (
	token: string,
	isLast: boolean,
	scope: MatchScope,
	includeIntent: boolean,
): ProductSearchClause => ({
	$should: searchSpellings(token)
		.flatMap((spelling) => spellingMatches(spelling, isLast, scope))
		.flatMap((match) => fieldMatches(match, includeIntent, scope !== "direct")),
});

/** Most words: one may miss in a short query, 40% of a pasted product name. */
const requiredTokenCount = (tokenCount: number) =>
	tokenCount <= 3 ? tokenCount - 1 : Math.ceil(tokenCount * 0.6);

const coveredTokens = (tokens: Array<string>, document: IndexedProductSearchDocument) => {
	const words = normalizeSearchText(
		[
			document.nameWithBrand,
			document.nameMn,
			document.aliases,
			document.dosage,
			document.ingredients,
			document.tags,
			document.category,
		].join(" "),
	).split(" ");
	return tokens.filter((token) =>
		searchSpellings(token).some((spelling) => words.some((word) => word.startsWith(spelling))),
	);
};

/**
 * Keeps candidates that cover most words, one of them rare in the catalog,
 * and ranks rare words above common ones. "nutricost creatin" shows creatine,
 * not every Nutricost product, and "castor oil" does not show every oil.
 */
const rankRelaxedHits = <Hit extends { data: IndexedProductSearchDocument }>(
	tokens: Array<string>,
	hits: Array<Hit>,
	catalogSize: number,
	keepOrder: boolean,
) => {
	const covered = hits
		.map((hit) => ({ hit, tokens: coveredTokens(tokens, hit.data) }))
		.filter((entry) => entry.tokens.length >= requiredTokenCount(tokens.length));
	const frequency = new Map<string, number>();
	for (const token of covered.flatMap((entry) => entry.tokens)) {
		frequency.set(token, (frequency.get(token) ?? 0) + 1);
	}
	const count = (token: string) => frequency.get(token) ?? 1;
	const weight = (entry: (typeof covered)[number]) =>
		entry.tokens.reduce((sum, token) => sum + 1 / count(token), 0);
	const specific = covered.filter((entry) =>
		entry.tokens.some((token) => count(token) <= catalogSize * RELAXED_RARE_SHARE),
	);
	const ranked = keepOrder ? specific : specific.toSorted((a, b) => weight(b) - weight(a));
	return ranked.map((entry) => entry.hit);
};

/**
 * "direct" requires every word in the name, brand, dosage or aliases. "broad"
 * also reads ingredients, tags and description. "relaxed" lets any word match
 * and leaves the most-words cut to the caller.
 */
export const buildProductSearchFilter = (
	query: string,
	generation: string,
	filters?: ProductSearchFilters,
	matchScope: MatchScope = "direct",
): ProductSearchFilter => {
	const { phrase, tokens } = parseSearchQuery(query);
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
	const tokenFilters = tokens.map((token, index) =>
		tokenFilter(token, index === tokens.length - 1, matchScope, includeIntent),
	);
	const must: Array<ProductSearchClause> = [
		{ generation: { $eq: generation } },
		{ status: { $eq: "active" } },
		...(matchScope === "relaxed" ? [{ $should: tokenFilters }] : tokenFilters),
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
	compareAtPrice: document.compareAtPrice > 0 ? document.compareAtPrice : null,
	createdAt: document.createdAt,
	dailyIntake: document.dailyIntake,
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
			scoreMode: "multiply",
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
			// Broad matches a superset of direct, so it replaces a thin direct page only when it finds more.
			if (result.count < MIN_DIRECT_RESULTS && rankByDemand) {
				const broadFilter = buildProductSearchFilter(
					query,
					active.generation,
					input.filters,
					"broad",
				);
				const broad = await runQuery(broadFilter, false);
				result = broad.count > result.count ? broad : result;
			}
			const { tokens } = parseSearchQuery(query);
			if (result.count === 0 && tokens.length > 1) {
				const relaxedFilter = buildProductSearchFilter(
					query,
					active.generation,
					input.filters,
					"relaxed",
				);
				const hits = await queryIndex(
					redis,
					namespace,
					relaxedFilter,
					RELAXED_POOL_SIZE,
					0,
					false,
					input.sort,
				);
				const ranked = rankRelaxedHits(tokens, hits, active.productCount, input.sort !== undefined);
				result = { count: ranked.length, hits: ranked.slice(offset, offset + pageSize) };
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

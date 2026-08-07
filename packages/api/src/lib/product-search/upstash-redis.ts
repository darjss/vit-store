import { env } from "cloudflare:workers";
import { createDb } from "~/db";
import { loadProductSearchDocumentsFromDb } from "~/lib/product-search/db";
import {
	createSearchQueries,
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

const INDEX_NAME = "vit-products-v1";
const PRODUCT_KEY_PREFIX = "search:vit:product:";
const MANIFEST_KEY = "search:vit:manifest:v1";
const STATUS_KEY = "search:vit:status:v1";
const WRITE_BATCH_SIZE = 50;

type SearchEnv = Env & {
	UPSTASH_REDIS_REST_URL?: string;
	UPSTASH_REDIS_REST_TOKEN?: string;
	DIRECT_DB_URL?: string;
	DB: Hyperdrive;
};

type RedisCommandValue = string | number;
type RedisCommand = readonly RedisCommandValue[];
type RestResult<T> = { result?: T; error?: string };
type SearchFilter = Record<string, unknown>;
type RawSearchHit = [key: string, score: string | number, fields?: unknown[]];

type IndexedProductDocument = ProductSearchDocument & {
	createdAtEpoch: number;
};

const targetEnv = () => env as SearchEnv;

export const isUpstashRedisSearchConfigured = () => {
	const current = targetEnv();
	return Boolean(
		current.UPSTASH_REDIS_REST_URL?.trim() &&
			current.UPSTASH_REDIS_REST_TOKEN?.trim(),
	);
};

const credentials = () => {
	const current = targetEnv();
	const url = current.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
	const token = current.UPSTASH_REDIS_REST_TOKEN;
	if (!url || !token) {
		throw new Error("Upstash Redis Search credentials are not configured");
	}
	return { url, token };
};

const request = async <T>(path: string, body: unknown): Promise<T> => {
	const { url, token } = credentials();
	const response = await fetch(`${url}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const payload = (await response.json()) as RestResult<T>;
	if (!response.ok || payload.error) {
		throw new Error(
			payload.error ?? `Upstash Redis request failed with ${response.status}`,
		);
	}
	return payload.result as T;
};

const normalizeCommand = (args: RedisCommand) =>
	args.map((arg) => String(arg));

const command = <T>(args: RedisCommand) =>
	request<T>("", normalizeCommand(args));

const pipeline = async (commands: RedisCommand[]) => {
	if (commands.length === 0) return;
	const { url, token } = credentials();
	const response = await fetch(`${url}/pipeline`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(commands.map(normalizeCommand)),
	});
	const payload = (await response.json()) as RestResult<unknown>[];
	if (!response.ok) {
		throw new Error(`Upstash Redis pipeline failed with ${response.status}`);
	}
	const failed = payload.find((item) => item.error);
	if (failed?.error) throw new Error(failed.error);
};

const emptyStatus = (): ProductSearchStatus => ({
	initialized: false,
	memoryReady: false,
	productCount: 0,
	generatedAt: null,
	lastRebuildStartedAt: null,
	lastRebuildFinishedAt: null,
	lastRebuildReason: null,
	lastError: null,
});

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : "Unknown error";

const productKey = (id: number) => `${PRODUCT_KEY_PREFIX}${id}`;

const readJson = async <T>(key: string): Promise<T | null> => {
	const value = await command<string | null>(["GET", key]);
	if (value == null) return null;
	return JSON.parse(value) as T;
};

const writeJson = (key: string, value: unknown) =>
	command<string>(["SET", key, JSON.stringify(value)]);

const createIndex = () =>
	command<string>([
		"SEARCH.CREATE",
		INDEX_NAME,
		"EXISTSOK",
		"ON",
		"STRING",
		"PREFIX",
		1,
		PRODUCT_KEY_PREFIX,
		"SCHEMA",
		"id",
		"I64",
		"FAST",
		"name",
		"TEXT",
		"NOSTEM",
		"nameMn",
		"TEXT",
		"NOSTEM",
		"nameWithBrand",
		"TEXT",
		"NOSTEM",
		"nameMnWithBrand",
		"TEXT",
		"NOSTEM",
		"description",
		"TEXT",
		"slug",
		"KEYWORD",
		"createdAt",
		"KEYWORD",
		"price",
		"F64",
		"FAST",
		"createdAtEpoch",
		"I64",
		"FAST",
		"discount",
		"F64",
		"FAST",
		"brand",
		"TEXT",
		"NOSTEM",
		"category",
		"TEXT",
		"NOSTEM",
		"status",
		"KEYWORD",
		"stock",
		"I64",
		"FAST",
		"inStock",
		"BOOL",
		"FAST",
		"amount",
		"TEXT",
		"NOSTEM",
		"potency",
		"TEXT",
		"NOSTEM",
		"dailyIntake",
		"I64",
		"FAST",
		"brandId",
		"I64",
		"FAST",
		"categoryId",
		"I64",
		"FAST",
		"isFeatured",
		"BOOL",
		"FAST",
		"image",
		"KEYWORD",
		"hasImage",
		"BOOL",
		"aliases",
		"TEXT",
		"NOSTEM",
		"normalized",
		"TEXT",
		"NOSTEM",
		"ingredients",
		"TEXT",
		"NOSTEM",
		"tags",
		"TEXT",
		"NOSTEM",
	]);

const indexDocument = (
	document: ProductSearchDocument,
): IndexedProductDocument => ({
	...document,
	nameMn: document.nameMn ?? "",
	nameWithBrand: document.nameWithBrand ?? document.name,
	nameMnWithBrand: document.nameMnWithBrand ?? document.nameMn ?? "",
	description: document.description ?? "",
	brandId: document.brandId ?? -1,
	categoryId: document.categoryId ?? -1,
	ingredients: document.ingredients ?? "",
	tags: document.tags ?? "",
	aliases: document.aliases ?? "",
	normalized: document.normalized ?? "",
	createdAtEpoch: Number.isFinite(Date.parse(document.createdAt))
		? Date.parse(document.createdAt)
		: 0,
});

const queryVariants = (query: string) =>
	Array.from(
		new Set(
			createSearchQueries(query)
				.map((variant) => normalizeSearchText(variant))
				.filter(Boolean),
		),
	).slice(0, 6);

const textClauses = (query: string): SearchFilter[] => [
	{ nameWithBrand: { $eq: query, $boost: 24 } },
	{ nameMnWithBrand: { $eq: query, $boost: 24 } },
	{ name: { $phrase: { value: query, slop: 0 }, $boost: 18 } },
	{ nameMn: { $phrase: { value: query, slop: 0 }, $boost: 18 } },
	{ brand: { $smart: query, $boost: 12 } },
	{ amount: { $smart: query, $boost: 12 } },
	{ potency: { $smart: query, $boost: 12 } },
	{ nameWithBrand: { $smart: query, $boost: 10 } },
	{ nameMnWithBrand: { $smart: query, $boost: 10 } },
	{ aliases: { $smart: query, $boost: 8 } },
	{ normalized: { $smart: query, $boost: 7 } },
	{ category: { $smart: query, $boost: 3 } },
	{ ingredients: { $smart: query, $boost: 2.5 } },
	{ tags: { $smart: query, $boost: 2.5 } },
	{ description: { $smart: query, $boost: 0.75 } },
];

export const buildUpstashProductSearchFilter = (
	query: string,
	filters?: ProductSearchFilters,
): SearchFilter => {
	const must: SearchFilter[] = [
		{ status: { $eq: "active" } },
		{ $should: queryVariants(query).flatMap(textClauses) },
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
		// Stock is a small merchandising nudge after lexical relevance, never
		// the primary ordering key as it was in the MiniSearch implementation.
		$should: [{ inStock: { $eq: true, $boost: 1.08 } }],
	};
};

const parseFields = (fields: unknown[] | undefined) => {
	if (!fields) return {};
	const data: Record<string, unknown> = {};
	for (const rawField of fields) {
		if (!Array.isArray(rawField) || rawField.length < 2) continue;
		const [field, value] = rawField as [string, unknown];
		if (field === "$") {
			if (typeof value === "string") {
				return JSON.parse(value) as Record<string, unknown>;
			}
			if (value && typeof value === "object") {
				return value as Record<string, unknown>;
			}
		}
		data[field] = value;
	}
	return data;
};

const toBoolean = (value: unknown) =>
	value === true || value === 1 || value === "1" || value === "true";

const toOptionalId = (value: unknown) => {
	if (value == null) return undefined;
	const id = Number(value);
	return Number.isFinite(id) && id >= 0 ? id : undefined;
};

const toSearchResult = (raw: RawSearchHit): SearchProductResult => {
	const data = parseFields(raw[2]) as Partial<IndexedProductDocument>;
	return {
		id: Number(data.id ?? raw[0].replace(PRODUCT_KEY_PREFIX, "")),
		name: data.name ?? "",
		nameMn: data.nameMn || undefined,
		slug: data.slug ?? "",
		price: Number(data.price ?? 0),
		createdAt: data.createdAt ?? "",
		discount: Number(data.discount ?? 0),
		brand: data.brand ?? "",
		category: data.category ?? "",
		status: data.status ?? "draft",
		stock: Number(data.stock ?? 0),
		inStock: toBoolean(data.inStock),
		amount: data.amount ?? "",
		potency: data.potency ?? "",
		dailyIntake: Number(data.dailyIntake ?? 0),
		brandId: toOptionalId(data.brandId),
		categoryId: toOptionalId(data.categoryId),
		isFeatured: toBoolean(data.isFeatured),
		image: data.image ?? "",
		hasImage: toBoolean(data.hasImage),
		ingredientPreview: Array.isArray(data.ingredientPreview)
			? data.ingredientPreview
			: [],
	};
};

const sortCommand = (sort?: ProductSearchSort): RedisCommandValue[] => {
	if (!sort) return [];
	return [
		"ORDERBY",
		sort.field === "price" ? "price" : "createdAtEpoch",
		sort.direction === "asc" ? "ASC" : "DESC",
	];
};

export const searchUpstashProductPage = async (
	input: ProductSearchInput,
): Promise<ProductSearchPage> => {
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

	const filter = buildUpstashProductSearchFilter(query, input.filters);
	const serializedFilter = JSON.stringify(filter);
	const offset = (page - 1) * pageSize;
	const [rawHits, rawCount] = await Promise.all([
		command<RawSearchHit[]>([
			"SEARCH.QUERY",
			INDEX_NAME,
			serializedFilter,
			"LIMIT",
			pageSize,
			"OFFSET",
			offset,
			...sortCommand(input.sort),
		]),
		command<number | string>([
			"SEARCH.COUNT",
			INDEX_NAME,
			serializedFilter,
		]),
	]);

	const totalCount = Number(rawCount ?? 0);
	const totalPages = Math.ceil(totalCount / pageSize);
	return {
		items: (rawHits ?? []).map(toSearchResult),
		pagination: {
			page,
			pageSize,
			totalCount,
			totalPages,
			hasNextPage: page < totalPages,
			hasPreviousPage: page > 1 && totalCount > 0,
		},
	};
};

const getDatabase = () => {
	const current = targetEnv();
	return current.DIRECT_DB_URL
		? createDb(current.DIRECT_DB_URL)
		: createDb(current.DB);
};

export const getUpstashProductSearchStatus = async () =>
	(await readJson<ProductSearchStatus>(STATUS_KEY)) ?? emptyStatus();

export const rebuildUpstashProductSearchIndex = async (
	reason: ProductSearchRebuildReason,
): Promise<ProductSearchStatus> => {
	const startedAt = new Date().toISOString();
	const previousStatus = await getUpstashProductSearchStatus();
	await writeJson(STATUS_KEY, {
		...previousStatus,
		lastRebuildStartedAt: startedAt,
		lastRebuildReason: reason,
		lastError: null,
	});

	try {
		await createIndex();
		const documents = await loadProductSearchDocumentsFromDb(getDatabase());
		const nextKeys = documents.map((document) => productKey(document.id));
		const previousKeys = (await readJson<string[]>(MANIFEST_KEY)) ?? [];
		const nextKeySet = new Set(nextKeys);
		const staleKeys = previousKeys.filter((key) => !nextKeySet.has(key));

		const writes = documents.map(
			(document) =>
				["SET", productKey(document.id), JSON.stringify(indexDocument(document))] as const,
		);
		for (let offset = 0; offset < writes.length; offset += WRITE_BATCH_SIZE) {
			await pipeline(writes.slice(offset, offset + WRITE_BATCH_SIZE));
		}
		if (staleKeys.length > 0) {
			await command<number>(["DEL", ...staleKeys]);
		}
		await writeJson(MANIFEST_KEY, nextKeys);
		await command<number>(["SEARCH.WAITINDEXING", INDEX_NAME]);

		const finishedAt = new Date().toISOString();
		const status: ProductSearchStatus = {
			initialized: true,
			memoryReady: true,
			productCount: documents.length,
			generatedAt: finishedAt,
			lastRebuildStartedAt: startedAt,
			lastRebuildFinishedAt: finishedAt,
			lastRebuildReason: reason,
			lastError: null,
		};
		await writeJson(STATUS_KEY, status);
		return status;
	} catch (error) {
		const failedStatus: ProductSearchStatus = {
			...previousStatus,
			lastRebuildStartedAt: startedAt,
			lastRebuildFinishedAt: new Date().toISOString(),
			lastRebuildReason: reason,
			lastError: errorMessage(error),
		};
		await writeJson(STATUS_KEY, failedStatus).catch(() => undefined);
		throw error;
	}
};

export const clearUpstashProductSearchIndex = async () => {
	const keys = (await readJson<string[]>(MANIFEST_KEY)) ?? [];
	if (keys.length > 0) await command<number>(["DEL", ...keys]);
	await Promise.allSettled([
		command<number>(["DEL", MANIFEST_KEY, STATUS_KEY]),
		command<number>(["SEARCH.DROP", INDEX_NAME]),
	]);
};

import { createDb } from "@vit/api/db";
import {
	buildProductSearchSnapshot,
	type createProductMiniSearch,
	hydrateProductSearchSnapshot,
	searchMiniSearchIndex,
} from "@vit/api/lib/product-search/core";
import { loadProductSearchDocumentsFromDb } from "@vit/api/lib/product-search/db";
import {
	productSearchInputSchema,
	productSearchPageSchema,
	productSearchRebuildReasonSchema,
	productSearchSnapshotSchema,
	productSearchStatusSchema,
	type ProductSearchDocument,
	type ProductSearchInput,
	type ProductSearchPage,
	type ProductSearchRebuildReason,
	type ProductSearchSnapshot,
	type ProductSearchStatus,
} from "@vit/api/lib/product-search/types";
import { DurableObject } from "cloudflare:workers";
import * as v from "valibot";
import { LosslessRebuildQueue } from "../lib/lossless-rebuild-queue";

const SNAPSHOT_KEY = "product-search:snapshot:v2";
const SNAPSHOT_META_KEY = "product-search:snapshot:v2:meta";
const SNAPSHOT_CHUNK_PREFIX = "product-search:snapshot:v2:chunk:";
const STATUS_KEY = "product-search:status:v1";
const SNAPSHOT_CHUNK_SIZE = 64_000;

type StoredSnapshotMeta = {
	version: 2;
	generatedAt: string;
	productCount: number;
	chunkCount: number;
};

const storedSnapshotMetaSchema = v.strictObject({
	version: v.literal(2),
	generatedAt: v.string(),
	productCount: v.pipe(v.number(), v.integer(), v.minValue(0)),
	chunkCount: v.pipe(v.number(), v.integer(), v.minValue(1)),
}) satisfies v.GenericSchema<unknown, StoredSnapshotMeta>;

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

export class ProductSearchObject extends DurableObject<Env> {
	private miniSearch: ReturnType<typeof createProductMiniSearch> | null = null;
	private documentsById = new Map<number, ProductSearchDocument>();
	private generatedAt: string | null = null;
	private loadPromise: Promise<void> | null = null;
	private readonly appEnv: Env;
	private readonly rebuilds: LosslessRebuildQueue<
		ProductSearchStatus,
		ProductSearchRebuildReason
	>;
	// Generation guard: clear() bumps this so in-flight rebuild/load can
	// detect they were superseded and skip writing back stale state (DO-3).
	private generation = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.appEnv = env;
		this.rebuilds = new LosslessRebuildQueue((reason) =>
			this.performRebuild(reason),
		);
	}

	async search(input: ProductSearchInput): Promise<ProductSearchPage> {
		const validated = v.parse(productSearchInputSchema, input);
		const query = validated.query.trim();
		const page = Math.max(validated.page ?? 1, 1);
		const pageSize = Math.min(Math.max(validated.pageSize ?? 10, 1), 100);
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

		await this.ensureLoaded();

		if (!this.miniSearch) {
			throw new Error("Product search index is unavailable");
		}

		return v.parse(
			productSearchPageSchema,
			searchMiniSearchIndex(
				this.miniSearch,
				this.documentsById,
				query,
				page,
				pageSize,
				validated.filters,
				validated.sort,
			),
		);
	}

	rebuild(reason: ProductSearchRebuildReason): Promise<ProductSearchStatus> {
		return this.rebuilds.request(
			v.parse(productSearchRebuildReasonSchema, reason),
		);
	}

	async getStatus(): Promise<ProductSearchStatus> {
		const stored = await this.ctx.storage.get<unknown>(STATUS_KEY);
		const status =
			stored === undefined
				? emptyStatus()
				: v.parse(productSearchStatusSchema, stored);

		return v.parse(productSearchStatusSchema, {
			...status,
			memoryReady: Boolean(this.miniSearch),
			lastError:
				status.lastError === null ? null : "product_search_rebuild_failed",
		});
	}

	async clear(): Promise<void> {
		// Bump generation so any in-flight rebuild/load sees a mismatch and
		// skips writing back stale state (DO-3). Await in-flight promises so
		// we don't null state out from under a concurrent write.
		this.generation++;
		const inFlight: Promise<unknown>[] = [this.rebuilds.whenIdle()];
		if (this.loadPromise) inFlight.push(this.loadPromise);
		await Promise.allSettled(inFlight);
		await this.deleteStoredSnapshot();
		await this.ctx.storage.delete(STATUS_KEY);
		this.miniSearch = null;
		this.documentsById = new Map();
		this.generatedAt = null;
		this.loadPromise = null;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.miniSearch) return;

		this.loadPromise ??= this.loadFromStorageOrRebuild().finally(() => {
			this.loadPromise = null;
		});

		await this.loadPromise;
	}

	private async loadFromStorageOrRebuild(): Promise<void> {
		const myGeneration = this.generation;
		const snapshot = await this.readStoredSnapshot();

		if (!snapshot) {
			await this.rebuild("cold_missing_snapshot");
			return;
		}

		// Generation guard (DO-3): clear() may have run during the async read.
		if (myGeneration !== this.generation) return;

		const hydrated = hydrateProductSearchSnapshot(snapshot);
		this.miniSearch = hydrated.miniSearch;
		this.documentsById = hydrated.documentsById;
		this.generatedAt = snapshot.generatedAt;
	}

	private async performRebuild(
		reason: ProductSearchRebuildReason,
	): Promise<ProductSearchStatus> {
		const startedAt = new Date().toISOString();
		const previousStatus = await this.getStatus();
		const myGeneration = this.generation;
		await this.ctx.storage.put(
			STATUS_KEY,
			v.parse(productSearchStatusSchema, {
				...previousStatus,
				lastRebuildStartedAt: startedAt,
				lastRebuildReason: reason,
				lastError: null,
			}),
		);

		try {
			const directDbUrl = (this.appEnv as Env & { DIRECT_DB_URL?: string })
				.DIRECT_DB_URL;
			const db =
				directDbUrl && directDbUrl.length > 0
					? createDb(directDbUrl)
					: createDb(this.appEnv.DB);
			const documents = await loadProductSearchDocumentsFromDb(db);
			const snapshot = v.parse(
				productSearchSnapshotSchema,
				buildProductSearchSnapshot(documents),
			);
			const hydrated = hydrateProductSearchSnapshot(snapshot);
			const finishedAt = new Date().toISOString();
			const status = v.parse(productSearchStatusSchema, {
				initialized: true,
				memoryReady: true,
				productCount: snapshot.productCount,
				generatedAt: snapshot.generatedAt,
				lastRebuildStartedAt: startedAt,
				lastRebuildFinishedAt: finishedAt,
				lastRebuildReason: reason,
				lastError: null,
			});

			// Generation guard (DO-3): if clear() was called while we were
			// loading from the DB, skip writing back stale state.
			if (myGeneration !== this.generation) {
				return status;
			}

			await Promise.all([
				this.writeStoredSnapshot(snapshot),
				this.ctx.storage.put<ProductSearchStatus>(STATUS_KEY, status),
			]);

			// Re-check after the async write — clear() may have run during it.
			if (myGeneration !== this.generation) {
				return status;
			}

			this.miniSearch = hydrated.miniSearch;
			this.documentsById = hydrated.documentsById;
			this.generatedAt = snapshot.generatedAt;

			return status;
		} catch (error) {
			if (myGeneration === this.generation) {
				const failedStatus = v.parse(productSearchStatusSchema, {
					...previousStatus,
					memoryReady: Boolean(this.miniSearch),
					lastRebuildStartedAt: startedAt,
					lastRebuildFinishedAt: new Date().toISOString(),
					lastRebuildReason: reason,
					lastError: "product_search_rebuild_failed",
				});
				await this.ctx.storage.put(STATUS_KEY, failedStatus);
			}
			throw error;
		}
	}

	private async readStoredSnapshot(): Promise<ProductSearchSnapshot | null> {
		const storedMeta = await this.ctx.storage.get<unknown>(SNAPSHOT_META_KEY);
		if (storedMeta !== undefined) {
			const meta = v.parse(storedSnapshotMetaSchema, storedMeta);
			const chunkKeys = Array.from(
				{ length: meta.chunkCount },
				(_, index) => `${SNAPSHOT_CHUNK_PREFIX}${index}`,
			);
			const chunks = await Promise.all(
				chunkKeys.map((key) => this.ctx.storage.get<unknown>(key)),
			);
			const serialized = chunks
				.map((chunk) => v.parse(v.string(), chunk))
				.join("");
			return v.parse(productSearchSnapshotSchema, JSON.parse(serialized));
		}

		const legacy = await this.ctx.storage.get<unknown>(SNAPSHOT_KEY);
		return legacy === undefined
			? null
			: v.parse(productSearchSnapshotSchema, legacy);
	}

	/**
	 * Write new chunks + meta first, then delete stale chunks from the previous
	 * snapshot (DO-1). This way a crash/eviction between write and cleanup
	 * leaves either the old or the new snapshot intact, never an empty hole.
	 */
	private async writeStoredSnapshot(snapshot: ProductSearchSnapshot) {
		const validated = v.parse(productSearchSnapshotSchema, snapshot);
		const serialized = JSON.stringify(validated);
		const chunks: string[] = [];
		for (let i = 0; i < serialized.length; i += SNAPSHOT_CHUNK_SIZE) {
			chunks.push(serialized.slice(i, i + SNAPSHOT_CHUNK_SIZE));
		}

		// Read previous meta so we know which old chunk keys to clean up after.
		const storedPreviousMeta =
			await this.ctx.storage.get<unknown>(SNAPSHOT_META_KEY);
		const previousMeta =
			storedPreviousMeta === undefined
				? undefined
				: v.parse(storedSnapshotMetaSchema, storedPreviousMeta);
		const previousChunkCount = previousMeta?.chunkCount ?? 0;

		// Write new chunks + meta first.
		await Promise.all([
			this.ctx.storage.put<StoredSnapshotMeta>(SNAPSHOT_META_KEY, {
				version: 2,
				generatedAt: snapshot.generatedAt,
				productCount: snapshot.productCount,
				chunkCount: chunks.length,
			}),
			...chunks.map((chunk, index) =>
				this.ctx.storage.put(`${SNAPSHOT_CHUNK_PREFIX}${index}`, chunk),
			),
		]);

		// Delete stale chunks from the previous snapshot that exceed the new
		// chunkCount, plus the legacy single-key entry.
		const staleKeys: string[] = [SNAPSHOT_KEY];
		for (let i = chunks.length; i < previousChunkCount; i++) {
			staleKeys.push(`${SNAPSHOT_CHUNK_PREFIX}${i}`);
		}
		if (staleKeys.length > 1 || previousMeta) {
			await this.ctx.storage.delete(staleKeys);
		}
	}

	private async deleteStoredSnapshot() {
		const storedMeta = await this.ctx.storage.get<unknown>(SNAPSHOT_META_KEY);
		const meta =
			storedMeta === undefined
				? undefined
				: v.parse(storedSnapshotMetaSchema, storedMeta);
		const keys = [SNAPSHOT_KEY, SNAPSHOT_META_KEY];
		if (meta) {
			keys.push(
				...Array.from(
					{ length: meta.chunkCount },
					(_, index) => `${SNAPSHOT_CHUNK_PREFIX}${index}`,
				),
			);
		}
		await this.ctx.storage.delete(keys);
	}
}

import { createDb } from "@vit/api/db";
import {
	buildProductSearchSnapshot,
	hydrateProductSearchSnapshot,
	searchMiniSearchIndex,
} from "@vit/api/lib/product-search/core";
import { loadProductSearchDocumentsFromDb } from "@vit/api/lib/product-search/db";
import type {
	ProductSearchDocument,
	ProductSearchInput,
	ProductSearchRebuildReason,
	ProductSearchSnapshot,
	ProductSearchStatus,
	SearchProductResult,
} from "@vit/api/lib/product-search/types";
import { DurableObject } from "cloudflare:workers";
import type MiniSearch from "minisearch";

const SNAPSHOT_KEY = "product-search:snapshot:v1";
const SNAPSHOT_META_KEY = "product-search:snapshot:v1:meta";
const SNAPSHOT_CHUNK_PREFIX = "product-search:snapshot:v1:chunk:";
const STATUS_KEY = "product-search:status:v1";
const SNAPSHOT_CHUNK_SIZE = 64_000;

type StoredSnapshotMeta = {
	version: 1;
	generatedAt: string;
	productCount: number;
	chunkCount: number;
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

export class ProductSearchObject extends DurableObject<Env> {
	private miniSearch: MiniSearch<ProductSearchDocument> | null = null;
	private documentsById = new Map<number, ProductSearchDocument>();
	private generatedAt: string | null = null;
	private loadPromise: Promise<void> | null = null;
	private rebuildPromise: Promise<ProductSearchStatus> | null = null;
	private readonly appEnv: Env;
	// Generation guard: clear() bumps this so in-flight rebuild/load can
	// detect they were superseded and skip writing back stale state (DO-3).
	private generation = 0;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.appEnv = env;
	}

	async search(input: ProductSearchInput): Promise<SearchProductResult[]> {
		const query = input.query.trim();
		if (!query) return [];

		await this.ensureLoaded();

		if (!this.miniSearch) return [];

		return searchMiniSearchIndex(
			this.miniSearch,
			this.documentsById,
			query,
			input.limit ?? 10,
			input.filters,
		);
	}

	async rebuild(
		reason: ProductSearchRebuildReason,
	): Promise<ProductSearchStatus> {
		this.rebuildPromise ??= this.performRebuild(reason).finally(() => {
			this.rebuildPromise = null;
		});

		return this.rebuildPromise;
	}

	async getStatus(): Promise<ProductSearchStatus> {
		const status =
			(await this.ctx.storage.get<ProductSearchStatus>(STATUS_KEY)) ??
			emptyStatus();

		return {
			...status,
			memoryReady: Boolean(this.miniSearch),
		};
	}

	async clear(): Promise<void> {
		// Bump generation so any in-flight rebuild/load sees a mismatch and
		// skips writing back stale state (DO-3). Await in-flight promises so
		// we don't null state out from under a concurrent write.
		this.generation++;
		const inFlight: Promise<unknown>[] = [];
		if (this.rebuildPromise) inFlight.push(this.rebuildPromise);
		if (this.loadPromise) inFlight.push(this.loadPromise);
		if (inFlight.length > 0) {
			await Promise.allSettled(inFlight);
		}
		await this.deleteStoredSnapshot();
		await this.ctx.storage.delete(STATUS_KEY);
		this.miniSearch = null;
		this.documentsById = new Map();
		this.generatedAt = null;
		this.loadPromise = null;
		this.rebuildPromise = null;
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
		await this.ctx.storage.put<ProductSearchStatus>(STATUS_KEY, {
			...previousStatus,
			lastRebuildStartedAt: startedAt,
			lastRebuildReason: reason,
			lastError: null,
		});

		try {
			const directDbUrl = (this.appEnv as Env & { DIRECT_DB_URL?: string })
				.DIRECT_DB_URL;
			const db =
				directDbUrl && directDbUrl.length > 0
					? createDb(directDbUrl)
					: createDb(this.appEnv.DB);
			const documents = await loadProductSearchDocumentsFromDb(db);
			const snapshot = buildProductSearchSnapshot(documents);
			const hydrated = hydrateProductSearchSnapshot(snapshot);
			const finishedAt = new Date().toISOString();
			const status: ProductSearchStatus = {
				initialized: true,
				memoryReady: true,
				productCount: snapshot.productCount,
				generatedAt: snapshot.generatedAt,
				lastRebuildStartedAt: startedAt,
				lastRebuildFinishedAt: finishedAt,
				lastRebuildReason: reason,
				lastError: null,
			};

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
				const failedStatus: ProductSearchStatus = {
					...previousStatus,
					memoryReady: Boolean(this.miniSearch),
					lastRebuildStartedAt: startedAt,
					lastRebuildFinishedAt: new Date().toISOString(),
					lastRebuildReason: reason,
					lastError: errorMessage(error),
				};
				await this.ctx.storage.put<ProductSearchStatus>(
					STATUS_KEY,
					failedStatus,
				);
			}
			throw error;
		}
	}

	private async readStoredSnapshot(): Promise<ProductSearchSnapshot | null> {
		const meta =
			await this.ctx.storage.get<StoredSnapshotMeta>(SNAPSHOT_META_KEY);
		if (meta) {
			const chunkKeys = Array.from(
				{ length: meta.chunkCount },
				(_, index) => `${SNAPSHOT_CHUNK_PREFIX}${index}`,
			);
			const chunks = await Promise.all(
				chunkKeys.map((key) => this.ctx.storage.get<string>(key)),
			);
			if (chunks.some((chunk) => typeof chunk !== "string")) return null;
			return JSON.parse(chunks.join("")) as ProductSearchSnapshot;
		}

		return (
			(await this.ctx.storage.get<ProductSearchSnapshot>(SNAPSHOT_KEY)) ?? null
		);
	}

	/**
	 * Write new chunks + meta first, then delete stale chunks from the previous
	 * snapshot (DO-1). This way a crash/eviction between write and cleanup
	 * leaves either the old or the new snapshot intact, never an empty hole.
	 */
	private async writeStoredSnapshot(snapshot: ProductSearchSnapshot) {
		const serialized = JSON.stringify(snapshot);
		const chunks: string[] = [];
		for (let i = 0; i < serialized.length; i += SNAPSHOT_CHUNK_SIZE) {
			chunks.push(serialized.slice(i, i + SNAPSHOT_CHUNK_SIZE));
		}

		// Read previous meta so we know which old chunk keys to clean up after.
		const previousMeta =
			await this.ctx.storage.get<StoredSnapshotMeta>(SNAPSHOT_META_KEY);
		const previousChunkCount = previousMeta?.chunkCount ?? 0;

		// Write new chunks + meta first.
		await Promise.all([
			this.ctx.storage.put<StoredSnapshotMeta>(SNAPSHOT_META_KEY, {
				version: 1,
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
		const meta =
			await this.ctx.storage.get<StoredSnapshotMeta>(SNAPSHOT_META_KEY);
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

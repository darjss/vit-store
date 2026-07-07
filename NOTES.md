# Workers Cache adoption — progress notes (feat/workers-cache, base v2)

Source: https://blog.cloudflare.com/workers-cache/ (launched 2026-07-06),
https://developers.cloudflare.com/workers/cache/ and /workers/cache/configuration/.

## Research answers (evidence)

### (a) Script-upload API metadata field
Wrangler config `cache: { enabled: true }` maps to the upload-form metadata field
**`cache_options`** (value `{ enabled: boolean; cross_version_cache?: boolean }`).
Evidence: cloudflare/workers-sdk `packages/deploy-helpers/src/deploy/helpers/create-worker-upload-form.ts`
destructures `cache` from worker config (~L82) and emits `...(cache && { cache_options: cache })`
into the metadata object (~L851). Per-entrypoint override via `exports[name].cache` (Wrangler 4.107+).

### (b) Minimum compatibility_date
Docs example / changelog: `2026-07-07` ("set to today's date"; requires >= 2026-07-07).
Basic config needs Wrangler >= 4.69.0. We set `compatibilityDate: "2026-07-07"`.

### (c) Runtime API
- `ctx.cache.purge({ tags: [...] })` and `ctx.cache.purge({ purgeEverything: true })`.
- Also `import { cache } from "cloudflare:workers"` for non-ctx scope.
- `Cache-Tag` response header (comma-separated) tags an entry for later tag purge.
- `Cache-Control` honored per RFC 9111 (max-age, s-maxage, stale-while-revalidate),
  heuristic freshness when absent.
- `ctx.cache` (execution context) is undefined on old compat / miniflare → guard.

### (d) Automatic bypass
- Request with `Authorization` header → automatic bypass (not cached).
- Response with `Set-Cookie` → automatic bypass.
- `Cache-Control: private` / no-store → not cached.

## What landed
- alchemy 0.93.12 patched (bun patch): `cache?: {enabled;cross_version_cache?}` on
  BaseWorkerProps (src/cloudflare/worker.ts) + `cache_options` in WorkerMetadata &
  metadata payload (src/cloudflare/worker-metadata.ts). patches/alchemy@0.93.12.patch.
  NOTE: alchemy `./cloudflare` export is dual (bun→src, import→lib/*.d.ts). Runtime under
  bun uses src (patched). tsgo types resolve lib/*.d.ts → the patch MUST also cover
  lib/cloudflare/worker.d.ts (WIP: extending patch to lib d.ts).
- packages/shared/src/cache.ts: CACHE_POLICY (products/home 6h+24h SWR, categories/brands
  24h+7d SWR), cacheControlHeader(), CatalogCacheAccumulator, PRODUCTS_TAG/BRANDS_TAG/
  CATEGORIES_TAG + productTag/brandTag/categoryTag.
- packages/api/src/lib/cache/workers-cache.ts: markCacheable(ctx,policy,tags) (GET-only,
  accumulates into Hono var `catalogCache`), finalizeCatalogCacheHeaders(c) (stamps merged
  Cache-Control + Cache-Tag), purgeTags(ctx,tags) (guards ctx.cache undefined, never throws).
- Context: `cache?: WorkersCache` + Hono var `catalogCache` (packages/api context.ts,
  populated from executionCtx.cache in apps/server/src/lib/context.ts; ServerHonoEnv updated).
- Store reads tagged (store/product.ts, brand.ts, category.ts). Old KV catalog cache removed
  (deleted packages/api/src/lib/cache/catalog.ts); admin brand/category mutations now purge
  tags instead of ctx.kv.delete. Product + ai-product mutations purge PRODUCTS_TAG/productTag
  (+BRANDS_TAG/CATEGORIES_TAG for stock-derived lists).
- Finalize middleware wired on /trpc/store/* in apps/server/src/index.ts.
- alchemy.run.ts: compatibilityDate 2026-07-07 + cache:{enabled:true}.
- Storefront: home un-prerendered (SSR); middleware edge TTL 6h/24h-SWR for `/` + `/products*`.

## KV kept (documented exceptions — can't map to Workers Cache)
- trpc.ts `cacheMiddleware`/`cachedProcedure` (admin analytics/sales only): admin requests
  carry auth cookie/Authorization → Workers Cache auto-bypasses, so KV stays.
- Sessions, checkout-access, OTP, QPay token, payment, ai-product session, delivery-zone
  cache, restock notifier (scheduled, no HTTP response): non-cache or non-HTTP, unchanged.

## Cookie audit
publicProcedure = baseProcedure (errorHandling+logging only); auth()/session only in
customer/admin middlewares. Public catalog GET reads never call session → no Set-Cookie →
not bypassed. Safe.

## Remaining / TODO
- Extend alchemy patch to lib/cloudflare/worker.d.ts (type-level cache prop) — IN PROGRESS.
- @vit/assistant check-types errors (Cannot find module '~/db', BotRouter, @cloudflare/codemode)
  are PRE-EXISTING on base (unrelated to this change) — verify & exclude.
- Boot server dev on spare port, prove headers stamped + guard no-ops.
- Open PR (base v2).

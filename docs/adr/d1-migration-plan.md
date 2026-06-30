# vit-store: Planetscale (Postgres) → Cloudflare D1 Migration Plan

> Status: PROPOSED — awaiting approval. Engine is **PostgreSQL** (not MySQL as the
> original handoff stated): `drizzle-orm/postgres-js` + `pg-core`, port 5432.

## Goal
Move vit-store off Planetscale Postgres + Hyperdrive (Worker pinned to Singapore,
`aws:ap-southeast-1`) to Cloudflare D1 with edge placement, to cut Mongolia latency
from ~500–600ms to a target ~120–200ms on core endpoints.

## Expected outcome (to be proven on staging, not assumed)
- Health (no DB): ~427ms → ~20–30ms (placement removal — guaranteed).
- Product/category/detail: ~500–600ms → ~120–200ms (3–5x). Slightly above Plugged's
  numbers because vit-store runs Hono+tRPC+SuperJSON+Valibot and multiple sequential
  queries per request.
- Search: NO meaningful change — it's the Meilisearch/SQLite Durable Object, not Planetscale.

## Postgres features in use & D1/SQLite handling
| Feature | Where | Action | Risk |
|---|---|---|---|
| `db.transaction(async tx => …)` | checkout/order, payments, purchases (7), ai-purchase | Rewrite to `db.batch()` / sequential + compensation | 🔴 High (touches checkout) |
| `ilike` | order/purchase admin search | Plain `LIKE`; `lower()` on ASCII fields only. Address (Cyrillic) unchanged | 🟠 Low (confirmed acceptable) |
| `generatedAlwaysAsIdentity()` PKs | every table | `integer().primaryKey({ autoIncrement: true })` | 🟡 mechanical |
| `jsonb` (tags, ingredients, oldSlugs, payload) | products, messenger failures | `text({ mode: 'json' })`; default `'[]'` | 🟡 mechanical |
| `timestamp` + `defaultNow()`/`$onUpdate` | every table | `integer({ mode: 'timestamp' })`; `NOW()`→`unixepoch()` | 🟡 mechanical |
| `boolean` | several | integer 0/1 (convert on export) | 🟡 mechanical |
| `pgTableCreator`/`pg-core`, `varchar(len)` | schema.ts | `sqliteTableCreator`/`sqlite-core`, `text()` | 🟡 mechanical |
| `postgres-js` driver + `DIRECT_DB_URL` path | db/index.ts, db/client.ts, context.ts | `drizzle(env.DB)` over D1 binding | 🟡 mechanical |
| Fine as-is | `.returning()`, `onConflictDoUpdate`, COUNT/SUM/HAVING, `NULLS FIRST`, COALESCE, CAST | none | ✅ |

**D1 platform limits to design around:** 10GB/DB; ~100 bound params per statement
(chunk bulk inserts); no cross-`await` transactions (batch only); result-size caps;
use `wrangler d1 import` (not `execute --file`) for the data load.

## Branch & environment strategy
- Work on branch `devin/d1-migration`. Never touch `main`/prod until cutover is approved.
- Staging = a new Alchemy stage (`--stage staging`): parallel isolated KV/Worker/DO
  (names interpolate `${app.stage}`), default `*.workers.dev` URL (prod domain is
  prod-only), `placement` dropped, its own staging D1 DB. R2 bucket name is hardcoded
  `vit-store-bucket-prod` — left read-only for tests, parametrized only if we write to R2.

## Phases
- **Phase 0 — Scaffold (½ day):** branch; SQLite schema (parallel file or swap); new
  `drizzle.config` `dialect: sqlite/d1`; fresh baseline migration (15 pg migrations not reusable);
  add staging D1 binding in `alchemy.run.ts`, drop placement.
- **Phase 1 — Code port:** swap adapter + `createDb`; rewrite transaction sites to `batch()`;
  fix `ilike`; `lint` + `typecheck` + `build` green.
- **Phase 2 — Data pipeline:** repeatable export from Planetscale → transform (bool→0/1,
  ts→epoch, jsonb→text, preserve IDs + reset `sqlite_sequence`) → `wrangler d1 import` to staging.
- **Phase 3 — Verify on staging:** run the benchmark script + endpoints against staging D1;
  diff row counts; **checkout/order/payment e2e** (highest risk); confirm latency target.
- **Phase 4 — Cutover (explicit approval only):** brief write freeze → final incremental
  import → flip `DB` binding to prod D1 → deploy (no placement) → smoke test → keep
  Planetscale as instant rollback.

## Open items
- `.env.prod` import via the secure box arrived as a single line (newlines collapsed);
  values containing spaces (e.g. `KHAAN_USER_AGENT`) need correct reconstruction before
  a staging deploy. Will resolve at deploy time.
- Confirm whether staging D1 should be a fresh DB or share the prefixed (`ecom_vit_`) tables.

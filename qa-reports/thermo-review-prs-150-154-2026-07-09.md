# Thermo-nuclear code quality review — PRs #150–#154

**Date:** 2026-07-09  
**Repo:** `darjss/vit-store`  
**Base:** `origin/v2`  
**Reviewers:** parallel thermo-nuclear subagents (read-only), one per PR worktree  
**Worktrees:**  
- #150 `/home/darjs/dev/vit-wt-search` (`feat/search-stock-latency`)  
- #151 `/home/darjs/dev/vit-wt-celebration` (`feat/order-celebration`)  
- #152 `/home/darjs/dev/vit-wt-restock` (`feat/restock-notify`)  
- #153 `/home/darjs/dev/vit-wt-recs` (`feat/recs-cross-sell`)  
- #154 `/home/darjs/dev/vit-wt-sms` (`feat/sms-order-confirm`)  

**Note:** Findings were produced in-session only (not posted as GitHub review comments). Devin bot reviews on the same PRs are separate; see also `/tmp/vit-pr-bot-babysit-report.md`.

---

## Scoreboard

| PR | Title | Verdict |
|----|--------|---------|
| #150 | search stock-first + latency caches | **Request changes** |
| #151 | order-success celebration confetti | **Approve** |
| #152 | restock Postgres waitlist + event notify | **Request changes** |
| #153 | PDP recs + cart cross-sells | **Request changes** |
| #154 | SMS on payment success | **Request changes** |

Only **#151** clears the thermo bar as-is.

---

## PR #150 — `feat/search-stock-latency`

**Scope:** ~10 files, +200/−30 vs `origin/v2`.

### Blocker

1. **Lib → router cycle via dynamic import + fire-and-forget clear**  
   - Files: `packages/api/src/lib/product-search/client.ts`, `packages/api/src/routers/store/product-search-helpers.ts`  
   - `clearIsolateSearchCaches` dynamically imports router helpers to clear nav cache; clear is not awaited; import failures swallowed.  
   - **Fix:** One module under `lib/product-search/` (e.g. `isolate-cache.ts`) owns both search Map + nav lists + sync `clearAll()`. Delete dynamic import.

### Should-fix

2. **Stock-first ranking only on MiniSearch path** — fallback/DB path in `product-search-helpers` / `searchByName*` does not hard-sort stock-first.  
3. **Dual ad-hoc isolate caches** — `client.ts` LRU vs helpers single-entry + inflight; inconsistent; no inflight on search path. Collapse to one TTL(+inflight) helper.  
4. **Redundant `requireStock` filter** — both `core.resultMatchesFilters` and `performCatalogSearch` post-filter. Keep one.  
5. **Isolate cache vs HTTP purge** — other isolates can serve stale stock-ranked hits for ~30s after purge. Document or version-key.

### Nits

- Hard stock qty sort can bury tight low-stock name matches (product call: rank vs stock order).  
- Verbose comments vs house “no comments unless necessary”.  
- Needless `Boolean`/`Number` wraps on typed MiniSearch fields.

### What looks good

- Debounce restoration; `requireStock` end-to-end for search mode; stock out of score into explicit sort; `CACHE_POLICY.search` fits purge model.

### Verdict: **request changes** (must fix cache clear structure)

---

## PR #151 — `feat/order-celebration`

**Scope:** 7 files, +238/−8 vs `origin/v2`.

### Blockers

*None.*

### Should-fix

1. **Payment redirect coupled to confetti** — `payment-options.tsx` transfer success now navigates to `paymentSuccessUrl` (was order confirm). Product unify is OK if intentional; order-confirm + status flip still may not confetti. Prefer one owner path for “status → success” celebration.  
2. **~200-line particle engine** for a 2s flourish — consider smaller DOM/CSS burst; keep `celebrateOnce` + storage API.  
3. **Server import of engine module** for key strings in Astro frontmatter — split keys file or inline keys.

### Nits

- `COLORS[...]!`; intensity default `"strong"` duplicated; noise wrap-only edits.

### What works

- Dedup (memory + sessionStorage), reduced-motion, non-blocking canvas, brand palette, one-line checkout hook.

### Verdict: **approve**

---

## PR #152 — `feat/restock-notify`

**Scope:** restock lib, migration, admin, store UI, cron.

### Blockers

1. **Claim soft-deletes before send → crash loses waitlist**  
   - File: `packages/api/src/lib/restock/dispatch.ts` (`claimSubscription` / `notifyRestockSubscribers`)  
   - Claim sets `notifiedAt` **and** `deletedAt` before SMS/email. Fail path reopens; process kill does not. Safety net only sees open rows.  
   - **Fix:** Claim = `notifiedAt` only; success = `deletedAt`; fail = clear `notifiedAt`; unique open index on `deleted_at IS NULL AND notified_at IS NULL`; safety net reclaims stale in-flight claims. Do **not** use soft-delete as in-flight lock.

### Should-fix

2. **Dispatch hooks bolted on three routers** — not on all stock mutators (e.g. `deleteOrder` restore path). Prefer return previous/new stock from mutators + one schedule boundary.  
3. **Admin waitlist N+1** — `listRestockWaitCounts` then `getProductById` per row; use one join.  
4. **`waitCount` is subscription rows, not people** — SMS+email doubles; use distinct contact.  
5. **Sheet always mounted on every OOS card** — duplicate DOM ids, heavier islands; open-on-demand or one page-level sheet. Rename `disabled` → `outOfStock`.  
6. **Silent mutation failure** on sheet — restore error toast.  
7. **Public subscribe unthrottled** — rate limit before merge or accept known risk.

### Nits

- `MAX_OPEN_PRODUCTS_PER_CONTACT` living in dispatch; unused export `dispatchRestockIfCrossedZero`; `routeTree.gen.ts` churn; optional snapshot json.

### What works

- Postgres waitlist + partial unique; `@vit/api/lib/restock` ownership; claim-then-send *intent*; receive captures previous stock in txn.

### Verdict: **request changes** (must fix claim state model)

---

## PR #153 — `feat/recs-cross-sell`

**Scope:** recommended products + cart cross-sells + store queries/router.

### Blockers

1. **Undefined symbols in router (broken worktree split)**  
   - File: `packages/api/src/routers/store/product.ts`  
   - Uses without import/define: `RECOMMENDED_OVERSAMPLE`, `RECOMMENDED_LIMIT`, `CART_CROSS_SELL_LIMIT`, `rankInStockProducts`, `mapRecommendableProduct`.  
   - Will not typecheck/compile. Wire imports/constants/mapper.

2. **Fallback re-rank erases affinity**  
   - `rankInStockProducts([...primary, ...fallback], { limit })` re-sorts by stock; high-stock global can displace category/brand hits.  
   - **Fix:** append only shortfall without re-ranking merged list.

### Should-fix

3. Copy-pasted rank→fallback→rank in recs and cross-sell — one `completeRecommendables` helper.  
4. Four near-identical query shells in `store.ts` — one `findRecommendableProducts`.  
5. Dead `productName` prop on `CardAddButton` call sites and `RecommendedProductsProps`.  
6. Client re-filters/slices what server already enforced.  
7. Duplicated `withTimeout` in cart-cross-sells and recommended-products.

### Nits

- Image link a11y on PDP recs.

### What is solid

- Shared columns/`with`, `requireStock` conditions, cart drawer isolation, ATC via `CardAddButton` direction.

### Verdict: **request changes** (must fix compile + affinity fill)

---

## PR #154 — `feat/sms-order-confirm`

**Scope:** 3 files, +231/−1 vs `origin/v2`.

### Blockers

1. **SMS stuffed into `MessengerNotificationFailuresTable`**  
   - Wrong boundary; forces purpose filters on Messenger pending queries.  
   - **Fix:** fire-and-log without that table, or real multi-purpose notification ledger.

2. **Claim/outbox machinery with no consumer**  
   - Payment confirm is already single-winner; claim doesn’t buy re-confirm idempotency; failed SMS not retried by any worker.  
   - **Code judo:** ~40-line try/send/log on confirm path, or full outbox+retry — not a half-measure.

### Should-fix

3. **`getStorefrontBaseUrl()` magic** — CORS scrape + staging heuristics; prefer required `STORE_PUBLIC_URL`.  
4. **`sendSmsAndWait` on confirm hot path** — blocks confirm; prefer waitUntil/background.  
5. Duplicated error helpers / claim patterns vs `failed-notifications.ts`.

### Nits

- Local phone regex vs shared schema; nested try/catch scan cost.

### What is fine

- Hook in `confirmPaymentAndNotify`; never throws into payment; Mongolian copy + tracking URL.

### Verdict: **request changes** (simplify SMS path or finish real outbox)

---

## Cross-PR thermo themes

1. **Incomplete split / wiring** (#153) is a release blocker independent of product taste.  
2. **Lifecycle state machines half-done** — restock claim=soft-delete; SMS claim without retry.  
3. **Cache invalidation / ownership** — search isolate caches straddle lib and router.  
4. **#151 is the only ship-clean PR** on thermo alone.

---

## Suggested fix priority (thermo-only)

| Pri | PR | Action |
|-----|-----|--------|
| P0 | #153 | Fix router imports/constants/mapper; affinity-preserving fill |
| P0 | #152 | Recoverable claim (not soft-delete as lock) |
| P1 | #150 | Sync isolate-cache module; drop lib→router import |
| P1 | #154 | Don’t use Messenger failures table; don’t mark sent on Pending (aligns Devin) |
| P2 | #151 | Optional polish only |

---

## Related artifacts

- Snapshot branch (pre-split mixed wave): `snapshot/v2-conversion-wave` / `feat/v2-conversion-wave` @ `dcc5f0c`  
- Bot babysit (Devin/CI): `/tmp/vit-pr-bot-babysit-report.md`  
- PRs: https://github.com/darjss/vit-store/pull/150 … /154  

*End of thermo report.*

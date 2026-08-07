# HANDOFF — Finish staging v2 & drive vit-store to go-live

You are taking over an in-progress, multi-session go-live for **vit-store** (Mongolian vitamin e-commerce; `darjss/vit-store`; prod https://amerikvitamin.mn). You are one of **two equal orchestrator agents**. The other runs in herdr pane **`w8:pB`** (the "loc/curation" orchestrator, owns admin/data/khaan-payment lanes). You own **deploy/QA, integration into `v2`, staging, and the go-live sequence**. Coordinate by `herdr pane send-text w8:pB "<msg>"` then `herdr pane send-keys w8:pB Enter`; it replies into your session.

## READ FIRST (authoritative, in order)
1. `qa-reports/session-continuation-2026-07-07.md` — full prior state, both lanes.
2. GitHub issue **#125** — the go-live checklist (source of truth for sequence + staging checks).
3. `qa-reports/search-engine-handoff-2026-07-07.md` — search engine context.
4. `/tmp/astro-v7-alchemy-blockers.md` — why Astro v7 is parked (PR #142, do not touch).

## WHERE THINGS ARE NOW (2026-07-08)
- **`v2` @ `6cb6b3e` is the launch candidate.** Draft PR **#126** (v2→main) is the go-live PR. It contains, all merged + thermo-reviewed: sorbet-pop redesign, khaan bank-transfer flow, ct-token fix, sort fixes (2 stacked bugs), SSR hydration, search UX, checkout blur-first validation, **Workers Cache #130** (6h tagged TTLs, replaced KV cache, `s-maxage`), **search engine #132** (comma-dosage tokenization, symptom map, etc.), fix-wave #133 (#48/#55/#123 closed + category/brand sort toolbar), island safe-phases #135, OOS visibility #137, CI gates #138, retro-P1 fixes #140, and **the money-blocker fix (`02828fd`) just integrated** — transfer-match now requires paymentNumber-over-phone, a `tranDate >= payment.createdAt` window, and a global `khaan_consumed_transaction` ledger (sha256 fingerprint, atomic unique-violation → manual review). Verified through merge: `packages/api/src/queries/payments.ts` keeps BOTH `purgeTagsGlobal` (cache) AND `recordConsumedKhaanTransaction` (ledger).
- Prod DB migrations current through idx 13 applied (0014 backfill + short_gravity already run on the shared prod DB in an earlier staging cycle; `old_slugs` idx12 was reconciled via a bookkeeping INSERT).

## THE IMMEDIATE JOB — finish staging v2 (checklist #125 item 6/7)
**Gate:** the other Fable spawned an orch/Devin **thermo review of the money-path code (`02828fd`)** — get its verdict first; if it flags fixes, they land on `redesign/sorbet-pop` → you re-sync to v2 (see merge process below) before deploying.

Then run the definitive staging cycle:
1. **Migration reconciliation (CAREFUL — money-path DB).** Journal now has idx14=`0014_short_gravity` (order_details.price), idx15=`0015_add_khaan_consumed_transaction` (the ledger). On the SHARED prod DB, `__drizzle_migrations` (the `public.` one, not the stale `drizzle.` one) already has idx 0–14 applied; **only idx 15 is genuinely new.** Verify the journal-vs-DB state, then apply 0015 via `drizzle-kit migrate` from a v2 worktree (`packages/api`, creds `PLANETSCALE_*` in `.env`). Beware the two `0014`-prefixed SQL files (backfill + short_gravity) — drizzle sequences by journal tag, so it's fine, but confirm before running. Echo before/after.
2. **Redeploy all three apps to `--stage staging`** from v2 (`6cb6b3e`), server first: `bun alchemy deploy --app <server|storev2|admin> --stage staging --env-file <ENV>` (local wrangler OAuth auth). **TRIPWIRE:** if the server upload errors on `cache_options` metadata, stop and report (that's the alchemy patch).
3. **FIX STAGING ENV ISOLATION (do this or the e2e is invalid).** `.env.staging` currently sets `PUBLIC_API_URL`/`VITE_SERVER_URL` → **prod** API (`api.amerikvitamin.mn`), so the "staging" storefront bundle talks to PROD. Create a corrected gitignored env (copy `.env.prod`, override `PUBLIC_API_URL`+`VITE_SERVER_URL`→`https://server-api-staging.darjs.workers.dev`, `CORS_ORIGIN`→staging storefront origin, `DASH_URL`→staging admin) and redeploy with it. Without this, checkout tokens write to prod KV and the confirm page can't validate them on staging.
4. **Full e2e on the TRULY isolated staging**, screenshots for visual verify:
   - The **never-yet-proven valid-token confirm render**: cart product `7649` → transfer checkout (phone 88990011) → confirm → `?ct=` present AND `/order/confirm/<n>` RENDERS with PaymentStatus polling, no 401/500. Token must land in `vit-kv-staging` (ns `685917ba7b134c6baa21e234ec1c57f5`), not prod KV.
   - The **new transfer-match behavior**: confirm can't be triggered by a stale same-phone+amount transfer (the money fix); consumed-tx ledger dedups.
   - Regression sweep: redesign surfaces, sort, search (run `product.rebuildSearchIndex` admin mutation after deploy — tokenization changed; mint a staging admin session in `vit-kv-staging` if needed, key `admin_session:<hex(sha256(token))>`), OOS cards render below in-stock with restock CTA.
   - Record any test order numbers for the cleanup ledger.

## v2 MERGE PROCESS (how to sync sorbet-pop fixes in)
Use the reusable worktree `/tmp/claude-1000/.../scratchpad/v2-main` (or add one off v2). `git fetch origin`, `git merge origin/redesign/sorbet-pop`, resolve conflicts (migration `_journal.json` recurs — keep both entries sequenced by ascending `when`; money code in `payments.ts` must retain purge + ledger), `git push origin HEAD:v2`. NEVER commit in the main checkout `/home/darjs/dev/vit-store` (owner's uncommitted khaan working-tree files live there; single-writer = owner).

## LOST / OPEN WORK
- **B+D catalog+search redesign — LOST** (agent died pre-commit; `feat/catalog-search-redesign` never pushed, worktree gone). Owner selected **variant B (faceted filter drawer)** + **variant D (search takeover)**; mockups at https://html.darjs.dev/products-redesign-{b,d}. Rebuild if owner still wants it — NOT launch-gating.
- **Header/sidebar bugs — LOST & UNFIXED** (agent died pre-commit): owner reported sidebar login/profile section doesn't render, and header profile button (next to cart) does nothing on click. Suspect the Header.astro merge resolution dropped wiring. Diagnose on staging + fix. Worth fixing pre-launch (broken profile access).
- **PR #143** (search P2 follow-ups: honest token-drop, Cyrillic й NFKD fix, multi-word brand boost) — CI green (install/astro-check/tests all SUCCESS), `mergeable: UNKNOWN` because v2 moved; merge once it recomputes + CodeRabbit/Devin post. Owner OK'd merge-at-discretion for P2s.
- **PR #142** (Astro v7) — PARKED draft, do NOT merge.
- **PR #121** (Alchemy CI deploy) — merge LAST, after attended prod deploy. khaan-client is public now (authless).
- Owner card-CTA decision: cards should use a **small cart-icon button** (done in OOS #137's CardAddButton — verify).
- Transfer UI: account holder name must be **"Aviddaram Bazarragchaa"** and account from env (`KHAAN_ACCOUNT_NUMBER`); polling should auto-advance the payment page on reconcile while KEEPING the confirm button. Confirm the other Fable landed this in the money-fix commits; if not, it's their lane.

## GO-LIVE SEQUENCE REMAINING (#125)
staging cycle above → owner staging QA/benchmark (GATE) → mark #126 ready → merge v2→main → **owner attended prod deploy** (`gh secret set ENV_PROD < .env.prod` first; watch resources ADOPT not recreate; `ALCHEMY_STATE_TOKEN` in secrets) → delete QA fixtures (orders `P32D79ZY` [real ₮131k!], `GRNF8Z41`, `46ZAOLA5`, `HH7RUW7W`, `+ new`; payment `1UNLPMXCLM`; product `7649` — ping other Fable first) → merge #121 → disable CF Workers Builds git-integration for vit-admin/vit-backend in dashboard → housekeeping (drop direct `ky` dep from apps/server, delete backup branches, delete B+D/header lost-branch worktrees).

## PENDING OWNER DECISIONS
Product labels for `7574` (New Age AREDS 2) + `7577` (NuBest Tall Teens) → completes curation. Review-products page (mock data) fate. #16 Messenger PRD close/keep. B+D redesign + header fix priority.

## WORKFLOW CONSTRAINT
Owner directive: on the Opus main loop, prefer **`/orchestrate` + Devin CLI** for delegated work over Claude Task subagents. Direct git/gh/psql operations you run yourself are fine. Benchmarks proved v2's Workers Cache gives **4.7–6.6× faster warm API** vs prod — the caching work is validated.

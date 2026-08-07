# Session Continuation — vit-store go-live (2026-07-07, deploy/QA orchestrator)

Owner's usage window near exhaustion; this doc lets a fresh session resume both orchestrators' work with zero context. Read this + issue #125 (go-live checklist) + `qa-reports/search-engine-handoff-2026-07-07.md` first. The loc/curation orchestrator (sibling Claude session, herdr pane w8:pB) should APPEND its state below at §9.

## 1. Branch/PR state (verified at write time)

- **v2** = integration trunk (created from sorbet-pop @ d73e780). Contains: redesign + khaan transfer + P1 fixes (850e43a ct-token, d73e780 sort-cache) + **#128 SSR hydration (merged)** + **#129 search UX (merged)**. Draft **PR #126 (v2→main)** = the go-live PR.
- **redesign/sorbet-pop** = owner/khaan WIP branch in the MAIN checkout (/home/darjs/dev/vit-store — never commit/stash/reset there; owner's uncommitted edits + dev-script split live there). Pushed to origin @ 0736f97. **Sort fix CLICK-VERIFIED PASS (all 5 steps) and sorbet-pop MERGED into v2 (f707e2b, clean)** — go-live step 1 DONE. Loc-Fable's in-flight checkout-validation commit rides the next sorbet-pop→v2 sync. New post-launch UX item: category/brand routes have no sort toolbar and drop ?sort.
- **#118** frozen (review history only, do NOT merge). **#121** = CI deploy via Alchemy CloudflareStateStore — merge LAST, after attended deploy; khaan-client blocker RESOLVED (repo now public, authless github: spec; bun.lock entry sits uncommitted in main tree).
- **main**: has loc PR #124 (check state) and **#127 backlog fixes (MERGED)**. v2 must merge main before final.
- **feat/workers-cache** worktree /home/darjs/dev/vit-store-cache — agent was implementing (told to commit+push frequently; check origin for its branch state + NOTES.md).

## 2. In-flight agents at session end (all die with the session — resume from their artifacts)

| Work | Artifact to resume from |
|---|---|
| Workers Cache impl — **DIED AT SESSION LIMIT (resets 22:30 UB)**. WIP commit 55a4762 IS PUSHED to origin/feat/workers-cache; worktree /home/darjs/dev/vit-store-cache has UNCOMMITTED further edits (NOTES.md staged, brands.ts re-application mid-flight; beware — its dirty state also shows apps/admin file mods, likely from a base-style restore step: diff carefully before trusting). Resume: inspect worktree diff vs 55a4762, salvage, continue spec from #125 item 4b + NOTES.md |
| Checkout-validation UX verify (eeca9bf, merged to v2 @ 003a63e) — **DONE, ALL PASS** (silent-while-typing, single error on blur, live clear, submit reveals all three invalid fields, console clean; one unrelated dev-only HMR flake on recommended-products noted). Note: product 7649 qa-test-transfer-check now 404s — confirm loc-Fable deleted the fixture intentionally |
| Sort fix 0736f97 — **DONE, all 5 steps PASS**, merged to v2 |
| (other Fable) search-engine impl | Brief: qa-reports/search-engine-handoff-2026-07-07.md (FINAL) — check origin for branch orch/search-engine progress + /tmp/search-impl-summary.md |

## 3. Completed today (do not redo)

6 fix-PRs merged to main AM; 8 obsolete PRs closed; **29 issues closed** (evidence-commented); image migration 100% (zero amazon rows); #47 brand dedup executed in prod (6 pairs); #52/#53 closed; Devin staging CF resources deleted; CI PR #121 open + unblocked; PostHog MCP + Axiom MCP copied into Claude user config; sort root-caused; SSR hydration + search UX shipped into v2.

## 4. Pending owner decisions

- Ingredients for products 7574/7577 (label read) — curation apply then completes all 10.
- Post-launch: island-SSR epic (see §6), inventory gaps (creatine/reishi/ahcc/Blackmores — top ROI from search research), #16 close-or-keep (Messenger deprecated).

## 5. Go-live sequence (mirror of #125)

1. Click-verify 0736f97 → merge sorbet-pop→v2 (ref-level; owner's uncommitted working-tree files must NOT be committed).
2. Workers Cache PR → review → merge into v2.
3. Search-engine PR (other Fable) → review → merge into v2.
4. Merge main→v2 (picks up #124/#127; trivial conflicts expected in packages/api admin routers + alchemy.run.ts).
5. **Staging deploy of v2**: `alchemy deploy --stage staging` from a v2 worktree (shares prod DB — tag+delete test orders). Verify: Workers Cache HIT + tag purge, /order/confirm renders (proves 500 was miniflare-only), full khaan transfer flow, redesign smoke.
6. Mark #126 ready → merge v2→main.
7. **Attended prod deploy** from owner machine: refresh ENV_PROD secret (`gh secret set ENV_PROD < .env.prod`), then `CI=1 bun run deploy` — watch resources get ADOPTED not recreated (fresh alchemy-state-service bootstrap; ALCHEMY_STATE_TOKEN in .env.prod + GH secrets). Post-deploy: re-verify the 6 held issues' fixes live (#95-class), delete QA fixtures (orders P32D79ZY, GRNF8Z41, 46ZAOLA5; payments 1UNLPMXCLM; product 7649 — other Fable pings first).
8. Merge #121 (CI deploys from then on). Disable Workers Builds git-integration for vit-admin/vit-backend in CF dashboard (kills false-red checks).
9. Housekeeping: drop the direct `ky` dep from apps/server/package.json (only packages/api + khaan-client use ky; added during a broken-install workaround), restart API pane after install; delete backup branches (backup/soften-brutalism-sweep, redesign/soften-brutalism) once v2 is live.

## 6. Island-SSR audit verdict (post-launch epic input)

Full report in agent transcript; essentials: the Astro/Solid duplicate-UI pattern exists ONLY on /products (`#products-ssr` block + ServerProductCard vs the client:only ProductsList island). Everything else is skeleton-fallback islands (fine). Recommendation: do NOT flip directives pre-launch; the higher-value refactor is **unifying the duplicate card component** (server-product-card.astro vs product-card.tsx). If pursuing client:load on /products post-launch: needs (a) per-request QueryClient — PR #128's hydration helper uses a module-singleton client + module-scoped dedup Set, which is browser-fine but **cross-request-unsafe under SSR**; (b) virtualization guard to render all rows when gridWidth()===0 (else SSR emits only ~8/12 cards = SEO regression); (c) real bug regardless: `login-form.tsx:15,22` references raw `localStorage` at render scope → would crash any future SSR of that island. Effort L, risk Medium-High, ROI low.

## 7. Environment notes

- Dev stack panes: storefront w8:pJ (vitstore.dev, port 4321), API w8:pH (api.vitstore.dev, 3006); Caddy fronts both. Storefront pane occasionally hangs (502) — C-c + `bun run dev` recovers. khaan-client now installs from public github: (link: override gone).
- Worktrees to clean when done: vit-store-cache; older unrelated: vit-store-alchemy-ci, vit-store-fix-*, vit-store-seo.
- MCP servers in Claude user config: axiom, posthog (added today; live in NEW sessions).
- Coordination protocol with the sibling orchestrator: main checkout single-writer, all edits via worktrees+PRs, announce ref changes, reply via `herdr pane send-text <pane> "..."` + send-keys Enter.

## 8. Key contacts/IDs

Repo darjss/vit-store; CF account 8752869fa1eec4bbfc9c6f4f64fd3bfe; PlanetScale creds in .env (Postgres, table prefix ecom_vit_); prod https://amerikvitamin.mn; PostHog project 262338 (us).

## 9. Loc/curation orchestrator state — APPEND BELOW

---

# LOC/CURATION ORCHESTRATOR STATE (appended by the second Fable session)

## Merged to main today (my lane)
- PR #119 infra fixes, #120 products fixes, #122 orders fixes, #124 full admin Mongolian localization, #127 backlog fixes (ai-product draft default, addressZoneId preserve, updateOrder/delete/restore fully transactional). Triage comment on #127 records 2 deferred pre-existing findings.

## Unpushed commits on redesign/sorbet-pop (main tree, owner-directed khaan work)
98e5271 (khaan-client swap) → e3a9b24 (transfer flow UI) → 1820f17 (review P2s) → 3dc3e57 (429 backoff) → 850e43a (ct-token, VERIFIED PASS) → d73e780 (sort cache layer, query-level PASS) → 0736f97 (sort batch() click fix — click-verify was in progress by deploy/QA session).
IN FLIGHT on same branch: checkout validation-timing fix (blur-first, live-after-touched, one-error-per-field) — agent instructed to commit incrementally, commit message will start "fix(storev2): validate checkout fields on blur first".
Working tree also has owner-intended uncommitted: bun.lock (khaan-client github: entry), root package.json (dev excludes agent app; dev:ai runs all), apps/server/package.json (github: spec + ky dep — ky droppable after verification).

## khaan-client
Repo made PUBLIC (secret-scanned first). github:darjss/khaan-client resolves authless; #125 item 8 checked. dist/ committed upstream (ac2da37) — optional post-launch cleanup: proper publish + un-commit dist.

## Search-engine implementation (owner-assigned to this session)
Agent running in worktree /home/darjs/dev/vit-store-search, branch orch/search-engine off origin/v2, spec = qa-reports/search-engine-handoff-2026-07-07.md (FINAL incl §6). Instructed to commit+push per fix unit; progress log at /tmp/search-impl-summary.md. NEXT: opus gate review of branch, then PR into v2 (NOT main).

## Final fresh-eyes review cycle (admin, on origin/main)
3 read-only Opus reviewers running (orders/purchases, products/catalog, analytics/infra slices), NEW-issues-only, known-deferred excluded. Results were NOT yet in when this was written — on resume, check task notifications or re-run; findings go to a triaged report + fix wave if needed.

## Curation (done) + remainders
9 live placeholder products fully enriched in prod DB (desc/name_mn/seo/daily_intake/ingredients). Apply script + data: scratchpad orch/apply-curation.ts + curation-results.json (session scratchpad /tmp/claude-1000/-home-darjs-dev-vit-store/5ad0b3bd-*/scratchpad/orch/).
REMAINING DATA BATCH (one write): 7574 + 7577 ingredients (owner label-read pending) + 7567 status active→draft (soft-deleted row inconsistency).

## Cleanup ledger (after khaan e2e fully done; ping deploy/QA session before 7649)
Product 7649 (qa-test-transfer-check) · orders GRNF8Z41, 46ZAOLA5, P32D79ZY (accidental REAL ₮131,000) · payment 1UNLPMXCLM.

## Checkout validation bug (owner-reported, screenshot)
Typing in phone field flags both format errors immediately + untouched fields (Хаягийн бүс, Хаяг) pre-flagged red. Fix in flight per above; timing model only, rules unchanged.

## §9 UPDATE (post-limit-reset, loc/curation session)
- Fresh-eyes review cycle: COMPLETED before outage, all 3 reviewers reported. Consolidated: P1 order-repricing (order_details stores no price; inline saves re-price at live catalog + bake into Sales), P1 deliveryProvider edit silent no-op, P1 soft-deleted sales counted in getRevenue/getTotalProfit/getSalesByCategory/getTopBrands, P2 customer-form double-submit, P2 getNewCustomersCount missing deletedAt, P2 receivePurchase read-modify-write stock race, P2 updateProductField missing infinite-list invalidation, LOW week-chart UTC labels. NOTE for owner: review-products page is static mock data — cannot review real batch-created drafts (product decision, on #125).
- FINAL FIX WAVE relaunched: agent on worktree vit-store-finalfix, branch orch/final-fixes off origin/main, 8 dictated fixes incl. order_details price column migration (commit per fix, push every commit). Gate → PR to main when done.
- SEARCH ENGINE relaunched: prior agent died pre-first-commit. New agent on existing worktree vit-store-search-engine, branch orch/search-engine (local, zero commits at relaunch), commit+push per unit, log /tmp/search-impl-summary.md. Gate → PR into v2 when done.
- Checkout-validation fix eeca9bf: committed+pushed pre-outage (already merged to v2 by deploy/QA session).

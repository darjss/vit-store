# Accepted Audit Implementation Plans

Generated on 2026-07-18 against `878c937c3621ab35002e453da563f6ba551d6e86`. This directory contains exactly one self-contained Improve plan for each of the 26 accepted findings. Plans preserve current end-to-end behavior except their named correction and recommend no unit or integration tests.

## Status and accepted-ID mapping

| Plan | Accepted finding | Priority | Effort | Depends on | Suggested label | Status |
|---|---|---:|---:|---|---|---|
| 001 | [A-01 — Require an admin session before writes](001-require-an-admin-session-before-writes.md) | P0 | M | — | ready-for-human | TODO |
| 002 | [A-03 — Place product creation inside the signed-in admin area](002-place-product-creation-inside-the-signed-in-admin-area.md) | P0 | S | — | ready-for-agent | TODO |
| 003 | [A-04 — Bind address updates to the signed-in Customer](003-bind-address-updates-to-the-signed-in-customer.md) | P0 | S | — | ready-for-agent | TODO |
| 004 | [A-09 — Return the Customer from the Order transaction](004-return-the-customer-from-the-order-transaction.md) | P0 | S | — | ready-for-agent | TODO |
| 005 | [A-07 — Make transfer claims safe to repeat](005-make-transfer-claims-safe-to-repeat.md) | P0 | M | — | needs-info | TODO |
| 006 | [A-10 — Abort paid Order edits when stock cannot change](006-abort-paid-order-edits-when-stock-cannot-change.md) | P0 | M | — | needs-info | TODO |
| 007 | [B-01 — Render editable products from complete product data](007-render-editable-products-from-complete-product-data.md) | P1 | M | — | ready-for-agent | TODO |
| 008 | [B-02 — Make Featured and New match their labels](008-make-featured-and-new-match-their-labels.md) | P1 | M | — | needs-info | TODO |
| 009 | [B-03 — Open the storefront menu as a true modal](009-open-the-storefront-menu-as-a-true-modal.md) | P1 | M | — | ready-for-human | TODO |
| 010 | [B-04 — Refresh every cached purchase-list version after a write](010-refresh-every-cached-purchase-list-version-after-a-write.md) | P1 | S | — | ready-for-agent | TODO |
| 011 | [B-05 — Reject invalid catalog page numbers consistently](011-reject-invalid-catalog-page-numbers-consistently.md) | P1 | S | — | needs-info | TODO |
| 012 | [B-06 — Restore Delivery zone confirmation and Order notes](012-restore-delivery-zone-confirmation-and-order-notes.md) | P1 | S | — | ready-for-agent | TODO |
| 013 | [B-07 — Preserve old Product links when a slug changes](013-preserve-old-product-links-when-a-slug-changes.md) | P1 | M | — | needs-info | TODO |
| 014 | [S-03 — Use one QPay create-and-store function](014-use-one-qpay-create-and-store-function.md) | P1 | M | 004 | needs-info | TODO |
| 015 | [S-04 — Attempt both scheduled jobs every time](015-attempt-both-scheduled-jobs-every-time.md) | P2 | S | — | needs-info | TODO |
| 016 | [S-05 — List the admin functions the assistant already has](016-list-the-admin-functions-the-assistant-already-has.md) | P2 | S | — | ready-for-agent | TODO |
| 017 | [D-01 — Delete stale diagnostics and the cart placeholder](017-delete-stale-diagnostics-and-the-cart-placeholder.md) | P2 | M | — | ready-for-human | TODO |
| 018 | [D-03 — Delete unused shared copies and pass-through files](018-delete-unused-shared-copies-and-pass-through-files.md) | P2 | S | — | ready-for-agent | TODO |
| 019 | [D-04 — Remove the install-only CI job](019-remove-the-install-only-ci-job.md) | P2 | S | — | ready-for-human | TODO |
| 020 | [D-08 — Untrack reproducible reports and the dev log](020-untrack-reproducible-reports-and-the-dev-log.md) | P2 | S | — | needs-info | TODO |
| 021 | [D-10 — Remove misleading teardown and unrelated scratch files](021-remove-misleading-teardown-and-unrelated-scratch-files.md) | P2 | S | — | needs-info | TODO |
| 022 | [S-06 — Delete broken command names instead of recreating scripts](022-delete-broken-command-names-instead-of-recreating-scripts.md) | P2 | S | — | needs-info | TODO |
| 023 | [P-01 — Standardize workspace package resolution](023-standardize-workspace-package-resolution.md) | P1 | L | 018 | needs-info | TODO |
| 024 | [P-02 — Resolve ownership of the legacy logger package](024-resolve-ownership-of-the-legacy-logger-package.md) | P2 | M | — | needs-info | TODO |
| 025 | [P-04 — Reconcile SQL migrations with journal metadata](025-reconcile-sql-migrations-with-journal-metadata.md) | P0 | L | — | ready-for-human | TODO |
| 026 | [P-05 — Make cache maintenance environment-explicit and safe](026-make-cache-maintenance-environment-explicit-and-safe.md) | P0 | M | — | needs-info | TODO |

Status values: `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED — <reason>`, `REJECTED — <reason>`.

## Dependency graph and execution waves

Hard dependencies: `004 → 014` (avoid conflicting Order/QPay edits) and `018 → 023` (remove duplicate exports before choosing package resolution). All other ordering is coordination, not a blocker.

- **Wave 1 — independent work and information gates:** 001 002 003 004 007 008 009 010 011 012 013 015 016 017 018 019 020 021 022 024 025 026.
- **Wave 2 — after decisions or blockers:** 005 006 014 023.

Items labeled `needs-info` or `ready-for-human` begin with an owner/operator evidence gate; they are not permission to guess.

## Verified repository command inventory

These commands exist in baseline manifests; planning did not execute builds, installs, deploys, migrations, purges, or teardown:

| Command | Baseline meaning | Expected executor result |
|---|---|---|
| `bun run check-types` | Turbo workspace type checks | exit 0 |
| `bun run build` | Turbo workspace builds | exit 0 |
| `bun run lint` | Biome lint | exit 0 |
| `bun run --cwd apps/admin check-types` / `build` | dashboard checks/build | exit 0 |
| `bun run --cwd apps/storev2 check-types` / `build` | Astro checks/build | exit 0 |
| `bun run --cwd apps/agent checkout:sim` | existing checkout simulation | successful disposable flow with configured environment |
| `bun run --cwd apps/agent payment:proof` | existing Payment proof CLI | accepted invariant with configured environment |

Every plan states its real browser/API/Worker/Messenger/CLI proof. Environment credentials and operator approval are prerequisites and must never be printed. Destructive or remote-write commands are not verification.

## Existing-issue coordination

No accepted audit ID appears in the 34 open issues inspected during recon. Adjacent work must be coordinated without claiming duplicates or closing/modifying issues:

- **Plan 001**: Coordinate with broad go-live issue #125; do not claim duplication or modify it.
- **Plan 004**: Coordinate with adjacent order-error issue #149; this is not claimed as a duplicate.
- **Plan 005**: Coordinate with broad issues #125 and #149; preserve ADR-0004 and do not claim duplication.
- **Plan 006**: Coordinate with adjacent storefront error issue #149; this targets admin paid edits.
- **Plan 007**: Coordinate with search issue #149 and separate mobile card issue #159; do not claim duplication.
- **Plan 008**: Coordinate with adjacent category count issue #163; this is distinct list semantics.
- **Plan 011**: Coordinate with broader catalog URL issues #165 and #167; no duplicate claim.
- **Plan 012**: Coordinate with #149 asset QA and #172 delivery copy/loading work; neither duplicates state flow.
- **Plan 013**: Coordinate with broad old-link QA in #149; do not claim duplication.
- **Plan 014**: Coordinate with payment launch issue #125; keep this narrow.
- **Plan 016**: Coordinate with broad Messenger PRD #16; no exact overlap.
- **Plan 017**: Coordinate with go-live issue #125; do not close or modify it.
- **Plan 018**: Coordinate with package-boundary issue #139; this is the narrower deletion.
- **Plan 019**: Coordinate directly with open CI issue #139.
- **Plan 021**: Coordinate with operational issue #125.
- **Plan 022**: Coordinate with operational command context in #125.
- **Plan 023**: Coordinate with open package-boundary/CI issue #139; do not absorb its broader scope.
- **Plan 025**: Coordinate with migration sequencing context in #125; do not run or modify that issue.
- **Plan 026**: Coordinate with cache ownership work in #125.

## Rejected findings — record only, do not plan or publish

- `A-02` — rejected by the user; intentionally absent from plans and child drafts.
- `A-05` — rejected by the user; intentionally absent from plans and child drafts.
- `A-08` — rejected by the user; intentionally absent from plans and child drafts.
- `A-11` — rejected by the user; intentionally absent from plans and child drafts.
- `D-02` — rejected by the user; intentionally absent from plans and child drafts.
- `D-05` — rejected by the user; intentionally absent from plans and child drafts.
- `D-06` — rejected by the user; intentionally absent from plans and child drafts.
- `D-09` — rejected by the user; intentionally absent from plans and child drafts.
- `S-01` — rejected by the user; intentionally absent from plans and child drafts.
- `S-02` — rejected by the user; intentionally absent from plans and child drafts.
- `P-03` — rejected by the user; intentionally absent from plans and child drafts.

## Needs discussion — not accepted and not publishable

**A-06 — Delete the production photo diagnostic.** User note: “No note provided”. Decision question: **Should the production photo diagnostic be deleted, retained with an explicit owner/access policy, or handled in a separately approved change?** No plan or issue draft exists until the user answers.

## Publication boundary

`github-issue-proposal.md` and `.json` are drafts only. Do not publish until the user explicitly approves. Public drafts omit paths, snippets, secrets, Customer data, payload recipes, and unsafe operational instructions.

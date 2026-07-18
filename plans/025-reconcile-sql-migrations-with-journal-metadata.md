# Plan 025: Reconcile SQL migrations with journal metadata

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/db/migrations packages/api/src/db/schema.ts packages/api/drizzle.local.config.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: P-04
- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: migration
- **Suggested triage label**: `ready-for-human`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The accepted audit reported three tracked SQL migrations missing from journal metadata, while duplicate numeric prefixes complicate history. Baseline evidence also visibly contains a journal tag matching one reported candidate, so the first gate must recompute exact normalized set membership instead of assuming any file is absent. Fresh and deployed schemas may differ; only read-only comparison and forward-only repairs are safe.

## Current state

`packages/api/src/db/migrations/meta/_journal.json:80-91` visibly includes `"tag": "0013_messenger_notification_failures"`. The accepted audit candidate list also names `0011_elite_the_santerians.sql`, `0012_order_payment_uniques_claimed_status.sql`, and `0013_messenger_notification_failures.sql`; this inconsistency must be resolved by comparing normalized SQL basenames with journal tags.

### Domain and repository rule

Never rewrite applied journal entries or SQL files. Use disposable local data and read-only environment metadata; schema terms remain Product, Order, Payment, and Customer.

### Existing-issue coordination

Coordinate with migration sequencing context in #125; do not run or modify that issue.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/db/migrations packages/api/src/db/schema.ts packages/api/drizzle.local.config.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- inventory SQL/journal/schema/git history
- read-only comparison for every environment
- owner-approved new forward-only journaled repairs only where change is truly absent

**Files/path families allowed**
- `packages/api/src/db/migrations`
- `packages/api/src/db/schema.ts`
- `packages/api/drizzle.local.config.ts`

**Out of scope**
- editing applied history
- production migration execution
- destructive/shared database proof
- assuming duplicate prefixes are harmless

## Git workflow

- Branch: `audit/p-04-reconcile-sql-migrations-with-jour`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Recompute exact SQL-basename-to-journal-tag set equality and reconcile the baseline inconsistency before naming any missing migration; map only confirmed candidates to schema and git history

Recompute exact SQL-basename-to-journal-tag set equality and reconcile the baseline inconsistency before naming any missing migration; map only confirmed candidates to schema and git history.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: With operators, compare read-only migration/schema metadata in every environment

With operators, compare read-only migration/schema metadata in every environment. Stop on any divergence or ambiguity.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: After explicit approval, create new forward-only journaled migrations only for truly missing changes and prove a disposable fresh local database reaches `schema

After explicit approval, create new forward-only journaled migrations only for truly missing changes and prove a disposable fresh local database reaches `schema.ts`.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Inventory is recorded; no applied checksum/history changes; disposable fresh migration matches schema; production evidence remains read-only. Root/API checks build successfully.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `P-04` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Any environment differs unexpectedly.
- A file’s ownership/application state is ambiguous.
- Repair would alter applied history or require shared/production writes.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Review SQL/journal set equality and duplicate prefixes for every new migration.

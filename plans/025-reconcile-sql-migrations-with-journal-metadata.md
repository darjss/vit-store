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

**Baseline source:** `packages/api/src/db/migrations/meta/_journal.json:80-91`

```json
      "breakpoints": true
    },
    {
      "idx": 11,
      "version": "7",
      "when": 1779371141275,
      "tag": "0013_messenger_notification_failures",
      "breakpoints": true
    },
    {
      "idx": 12,
      "version": "7",
```

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

**Verify**: `python3 - <<'PY'
import json, pathlib
d=pathlib.Path('packages/api/src/db/migrations')
sql={p.stem for p in d.glob('*.sql')}
tags={e['tag'] for e in json.load(open(d/'meta/_journal.json'))['entries']}
print('sql-only', *sorted(sql-tags), sep='\n')
print('journal-only', *sorted(tags-sql), sep='\n')
PY` → normalized SQL/journal differences are printed; do not name a missing migration until this output and git history agree.

### Step 2: With operators, compare read-only migration/schema metadata in every environment

With operators, compare read-only migration/schema metadata in every environment. Stop on any divergence or ambiguity.

**Verify**: After pointing `drizzle.local.config.ts` at a newly created disposable local database, run `bun run --cwd packages/api db:migrate:local && bun run check-types` → migration and root typecheck exit 0; schema comparison records no missing declared table/column/index and no applied migration file changed.

### Step 3: After explicit approval, create new forward-only journaled migrations only for truly missing changes and prove a disposable fresh local database reaches `schema

After explicit approval, create new forward-only journaled migrations only for truly missing changes and prove a disposable fresh local database reaches `schema.ts`.

**Verify**: **Prerequisites/setup:** Database owner, read-only migration metadata access for every environment, and a brand-new disposable local database only after repair approval.

**Bounded procedure:** Record environment comparison; apply approved forward-only sequence only to fresh local DB; compare resulting schema to declared schema.

**Machine-observable expected result:** Every environment state is accounted for, fresh schema matches, no applied journal/SQL checksum changes, and no production write occurs.

**Cleanup:** Drop only the disposable local DB using the existing local workflow after owner confirms evidence capture.

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

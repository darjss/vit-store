# Plan 024: Resolve ownership of the legacy logger package

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/logger packages/api/scripts/import-extracted-only-products.ts packages/api/package.json README.md packages/api/src/lib/logger`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: P-02
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The legacy logger has one undeclared script caller and no application caller, while application code uses the API-owned logger. Deletion could break an operator import or external parser, so ownership and output compatibility come first.

## Current state

`packages/api/scripts/import-extracted-only-products.ts` imports `@vit/logger` and calls it; `packages/api/package.json` does not declare that dependency. README still lists the logger package.

### Domain and repository rule

Logging uses safe wide events. Preserve required structured field names without recording Customer content or credentials.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/logger packages/api/scripts/import-extracted-only-products.ts packages/api/package.json README.md packages/api/src/lib/logger` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- operator/external-consumer decision
- if retained, migrate the script to owned logger with compatible safe fields
- remove package/docs only after no caller remains

**Files/path families allowed**
- `packages/logger`
- `packages/api/scripts/import-extracted-only-products.ts`
- `packages/api/package.json`
- `README.md`
- `packages/api/src/lib/logger`

**Out of scope**
- deleting ingestion script without approval
- changing log retention/content policy
- second logger abstraction

## Git workflow

- Branch: `audit/p-02-resolve-ownership-of-the-legacy-lo`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Identify script owner and any parser of its output

Identify script owner and any parser of its output. Capture only field names with disposable no-network validation.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: If active, replace its logger calls with the owned API logger and declare correct dependencies; if inactive, obtain separate approval before retiring script

If active, replace its logger calls with the owned API logger and declare correct dependencies; if inactive, obtain separate approval before retiring script.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Only when no caller remains, remove package and stale docs; run CLI/static/build proof

Only when no caller remains, remove package and stale docs; run CLI/static/build proof.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

`git grep -n @vit/logger` has no active import after approved path; disposable CLI preserves required safe keys; root `check-types`/`build` exit 0.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `P-02` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- No owner can be identified.
- External ingestion depends on output that cannot be preserved.
- The script is active but replacement changes required keys.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Keep one logger owner and declare dependencies for retained scripts; never log Customer content by default.

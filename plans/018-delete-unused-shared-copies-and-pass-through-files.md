# Plan 018: Delete unused shared copies and pass-through files

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/shared/src/index.ts packages/shared/src/domain/order/index.ts packages/shared/src/domain/payment/index.ts packages/shared/src/types/messenger.ts packages/shared/src/types/integration.ts packages/shared/package.json`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: D-03
- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Four shared files duplicate API-owned contracts or only pass exports through, and no tracked caller imports them. Removing proven-unused exports narrows package ownership, but external/package consumers must be checked before deletion.

## Current state

`packages/shared/src/index.ts:1-9` exports order/payment domain pass-throughs and `types`. The pass-through files only re-export root constants/types; Messenger/integration interfaces have no tracked import.

### Domain and repository rule

Live integration and Messenger contracts are API-owned. Preserve shared product/order constants and schema. Do not create a replacement contracts package.

### Existing-issue coordination

Coordinate with package-boundary issue #139; this is the narrower deletion.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/shared/src/index.ts packages/shared/src/domain/order/index.ts packages/shared/src/domain/payment/index.ts packages/shared/src/types/messenger.ts packages/shared/src/types/integration.ts packages/shared/package.json` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- four named unused files
- their barrel exports
- manifest exports/dependencies proven unused

**Files/path families allowed**
- `packages/shared/src/index.ts`
- `packages/shared/src/domain/order/index.ts`
- `packages/shared/src/domain/payment/index.ts`
- `packages/shared/src/types/messenger.ts`
- `packages/shared/src/types/integration.ts`
- `packages/shared/package.json`

**Out of scope**
- API-owned types
- product domain
- shared constants/schema
- package redesign

## Git workflow

- Branch: `audit/d-03-delete-unused-shared-copies-and-pa`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Inspect publication metadata, release references, and all tracked/external documented consumers

Inspect publication metadata, release references, and all tracked/external documented consumers. Search every exported symbol/path.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: If no consumer exists, delete files/exports and only manifest entries now proven unused

If no consumer exists, delete files/exports and only manifest entries now proven unused.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Run frozen dependency resolution only if operator permits existing environment use, then static/build checks

Run frozen dependency resolution only if operator permits existing environment use, then static/build checks.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

`git grep` finds no removed import/symbol; `bun run check-types` and `bun run build` exit 0. No active exports or dependencies are accidentally removed.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `D-03` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Any documented external consumer imports a path.
- A retained live caller appears.
- A dependency’s use cannot be identified.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Keep integration contracts with their API implementation; avoid recreating shared duplicates.

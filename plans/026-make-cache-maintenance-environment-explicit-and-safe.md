# Plan 026: Make cache maintenance environment-explicit and safe

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- scripts/clear-kv-cache.ts packages/api/src/lib/cache package.json README.md`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: P-05
- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: security
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The cache utility defaults to all targets, mutates a tool-private local format, and can target a fixed remote environment. It must do no I/O without an explicit environment and preview, or be deleted if unowned.

## Current state

`scripts/clear-kv-cache.ts:107-132` defaults `target` to `"all"`, then always calls both local and remote clearers. A fixed remote target exists elsewhere in the file and is intentionally not reproduced.

### Domain and repository rule

Cache invalidation belongs with the code that constructs keys. Never expose fixed identifiers or operational deletion recipes, and never use production as proof.

### Existing-issue coordination

Coordinate with cache ownership work in #125.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- scripts/clear-kv-cache.ts packages/api/src/lib/cache package.json README.md` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- cache/analytics owner decision
- delete utility if unowned, or redesign with explicit environment and non-destructive preview
- remove stale catalog modes/private storage mutation

**Files/path families allowed**
- `scripts/clear-kv-cache.ts`
- `packages/api/src/lib/cache`
- `package.json`
- `README.md`

**Out of scope**
- running any baseline purge
- production/shared namespace proof
- printing identifiers/credentials
- changing application cache semantics

## Git workflow

- Branch: `audit/p-05-make-cache-maintenance-environment`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner confirms whether the utility remains needed and which cache code owns current keys

Owner confirms whether the utility remains needed and which cache code owns current keys.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: If retained, require explicit environment, derive keys from owner, and make default invocation fail with usage before I/O; add preview/confirmation before remote action

If retained, require explicit environment, derive keys from owner, and make default invocation fail with usage before I/O; add preview/confirmation before remote action. Otherwise remove utility/docs.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Prove only against a disposable local namespace after implementation approval

Prove only against a disposable local namespace after implementation approval. Never invoke the baseline script.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Default invocation performs no I/O and exits with usage; retained static scan has no fixed production target or private-storage path; disposable local preview selects only intended keys. Root checks/build exit 0.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `P-05` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Ownership/use is unknown.
- Environment cannot be selected unambiguously.
- Proof would touch remote/shared data or key ownership is stale.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Operational cache tools must be environment-explicit, previewable, and owned by key-producing code.

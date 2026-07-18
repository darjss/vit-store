# Plan 022: Delete broken command names instead of recreating scripts

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- package.json README.md apps/admin/package.json apps/agent/package.json apps/server/package.json apps/storev2/package.json packages/api/package.json`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: S-06
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Manifests advertise commands whose local targets are absent and workspace aliases that do not name current workspaces. Broken names should be removed with stale docs after operator/runbook checks, not recreated speculatively.

## Current state

Root `package.json:47-55` includes script-backed commands such as `start:dev`, Vit extraction/comparison, and brand-logo scraping; `dev:native`/`dev:web` use workspace names absent from the current inventory.

### Domain and repository rule

Retained commands must point to tracked files or declared workspace names. Dated scripts are not deleted merely because they lack a manifest entry.

### Existing-issue coordination

Coordinate with operational command context in #125.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- package.json README.md apps/admin/package.json apps/agent/package.json apps/server/package.json apps/storev2/package.json packages/api/package.json` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- complete manifest target/filter inventory
- remove only proven-broken command names and matching docs

**Files/path families allowed**
- `package.json`
- `README.md`
- `apps/admin/package.json`
- `apps/agent/package.json`
- `apps/server/package.json`
- `apps/storev2/package.json`
- `packages/api/package.json`

**Out of scope**
- recreating absent scripts
- changing working commands
- deleting dated operator scripts without approval

## Git workflow

- Branch: `audit/s-06-delete-broken-command-names-instea`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Inventory every local target and Turbo/workspace filter; check README, runbooks, and external workflows

Inventory every local target and Turbo/workspace filter; check README, runbooks, and external workflows.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Owner confirms no external runbook requires each broken alias; remove it and its stale documentation

Owner confirms no external runbook requires each broken alias; remove it and its stale documentation.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Dry-run retained workspace filters and repeat an exact target-existence scan

Dry-run retained workspace filters and repeat an exact target-existence scan.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Target scan reports no missing local files; retained filters select intended single workspaces; `git grep` has no stale removed command documentation.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `S-06` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- External runbook still uses a name.
- A filter selects unexpected packages.
- A dated script’s ownership is unclear.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Add package scripts only with a tracked target, owner, and proof command.

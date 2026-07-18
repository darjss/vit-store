# Plan 023: Standardize workspace package resolution

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- tsconfig.base.json apps/agent/tsconfig.json apps/admin/tsconfig.json packages/shared/package.json packages/api/package.json turbo.json`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: P-01
- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/018-delete-unused-shared-copies-and-pass-through-files.md
- **Category**: migration
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Consumers resolve workspace packages inconsistently from source or generated dist, so clean builds may depend on stale output or task order. One model must be proven across Agent, Assistant, dashboard, storefront, and server before aliases change.

## Current state

**Baseline source:** `tsconfig.base.json:25-31`

```json
		"disableSolutionSearching": true,
		"paths": {
			"@vit/shared": ["./packages/shared/dist/index.js"],
			"@vit/shared/*": ["./packages/shared/dist/*"],
			"@vit/api": ["./packages/api/src/index.ts"],
			"@vit/api/*": ["./packages/api/src/*"]
		}
```

### Domain and repository rule

This plan must not implement the rejected adjacent package-output proposal. It is an evidence-led decision and consistency change only after every consumer is proven.

### Existing-issue coordination

Coordinate with open package-boundary/CI issue #139; do not absorb its broader scope.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- tsconfig.base.json apps/agent/tsconfig.json apps/admin/tsconfig.json packages/shared/package.json packages/api/package.json turbo.json` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- resolution matrix and owner decision
- only aliases/exports required for one proven model
- documentation of selected model

**Files/path families allowed**
- `tsconfig.base.json`
- `apps/agent/tsconfig.json`
- `apps/admin/tsconfig.json`
- `packages/shared/package.json`
- `packages/api/package.json`
- `turbo.json`

**Out of scope**
- package redesign/publishing
- half-mixed per-consumer workaround
- unapproved package output changes

## Git workflow

- Branch: `audit/p-01-standardize-workspace-package-reso`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner chooses candidate only after recording every consumer/build tool and package export

Owner chooses candidate only after recording every consumer/build tool and package export. Prove it in a disposable worktree/config.

**Verify**: `git grep -n -E '@vit/(shared|api)' -- 'tsconfig*.json' 'apps/**/tsconfig.json' 'packages/*/package.json' turbo.json` → produces one source/dist matrix for every application consumer; record the candidate model and stop at the first incompatible tool.

### Step 2: At the first incompatible tool, stop and document evidence

At the first incompatible tool, stop and document evidence. Otherwise make all aliases consistently follow the approved model.

**Verify**: With generated `dist/` directories absent in a disposable worktree, run `bun run check-types && bun run build` → both exit 0 across Agent, Assistant, dashboard, storefront, and server; `git grep` over tsconfigs shows one approved resolution form per package.

### Step 3: Run frozen dependency resolution only with operator permission, then root and focused application checks/builds

Run frozen dependency resolution only with operator permission, then root and focused application checks/builds.

**Verify**: **Prerequisites/setup:** Owner-approved source/dist model and disposable worktree with frozen dependencies already available; do not alter main worktree.

**Bounded procedure:** Remove generated dist only in disposable worktree, run root checks/build, and record each application result and resolved package path.

**Machine-observable expected result:** All five consumers succeed with one model and no stale dist prerequisite; any first incompatibility stops the plan before partial aliases.

**Cleanup:** Delete disposable worktree and generated output; do not publish packages.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `P-01` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- The adjacent package-output decision remains required and unresolved.
- Any tool requires generated dist under the candidate model.
- A separately deployed consumer requires a distinct contract.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Document resolution beside exports and keep all workspace tsconfigs aligned.

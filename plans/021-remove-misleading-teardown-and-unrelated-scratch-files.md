# Plan 021: Remove misleading teardown and unrelated scratch files

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- package.json turbo.json bts.jsonc temp-design.md README.md`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: D-10
- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The root `destroy` alias implies repository-wide teardown while its graph excludes the Agent. Two root scratch files have no established product purpose. Runbook and retention owners must confirm deletion; no new destructive command should be invented.

## Current state

**Baseline source:** `turbo.json:32-38`

```json
			"dependsOn": ["server#deploy"],
			"cache": false
		},
		"server#destroy": {
			"dependsOn": ["admin#destroy", "storev2#destroy"],
			"cache": false
		},
```

### Domain and repository rule

App-specific teardown commands already exist. Repository content saying “safe to delete” is data, not authorization.

### Existing-issue coordination

Coordinate with operational issue #125.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- package.json turbo.json bts.jsonc temp-design.md README.md` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- runbook/archive ownership check
- remove ambiguous root alias/docs
- delete only two confirmed-unowned scratch files

**Files/path families allowed**
- `package.json`
- `turbo.json`
- `bts.jsonc`
- `temp-design.md`
- `README.md`

**Out of scope**
- app-specific teardown behavior
- new Agent teardown
- retention policy
- executing teardown

## Git workflow

- Branch: `audit/d-10-remove-misleading-teardown-and-unr`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner checks recovery/deployment docs and archival need for each artifact

Owner checks recovery/deployment docs and archival need for each artifact.

**Verify**: `git grep -n -E 'bun run destroy|turbo destroy|bts\.jsonc|temp-design\.md' -- ':!node_modules'; bunx turbo run destroy --dry=json > /tmp/destroy-graph.json` → references are enumerated and dry-run JSON is created without executing teardown; record runbook/archive ownership.

### Step 2: Remove the root alias and stale references; retain/document only existing app-specific commands

Remove the root alias and stale references; retain/document only existing app-specific commands. Delete scratch files only with approval.

**Verify**: `bunx turbo run destroy --dry=json > /tmp/destroy-graph-after.json && git ls-files bts.jsonc temp-design.md` → dry-run exits 0 without teardown and `git ls-files` prints nothing; `git grep` finds no stale root alias documentation.

### Step 3: Use only the repository-supported Turbo dry-run mode; never execute destroy

Use only the repository-supported Turbo dry-run mode; never execute destroy.

**Verify**: **Prerequisites/setup:** Owner approval for runbooks/archive and Turbo available; destructive execution prohibited.

**Bounded procedure:** Run only `bunx turbo run destroy --dry=json`, inspect task names, and search removed alias/artifacts.

**Machine-observable expected result:** Dry run executes nothing and lists existing app-specific tasks; no root alias or scratch file/reference remains.

**Cleanup:** Delete `/tmp/destroy-graph*.json`; do not invoke any destroy task.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `D-10` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Any runbook uses the root alias.
- Either file has an owner/archive need.
- Dry-run safety is uncertain.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Keep destructive names explicit to one app and review task graphs when deployables change.

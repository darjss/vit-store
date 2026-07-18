# Plan 020: Untrack reproducible reports and the dev log

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- package.json .gitignore code-issues.json health-issues.json apps/storev2/dev.log`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: D-08
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Two reproducible quality snapshots and a development log are tracked, creating stale noisy diffs. Future quality JSON should go to ignored scratch storage, while separately owned reports remain untouched.

## Current state

`package.json:53-57` redirects `quality:json` output to `code-issues.json` and `health-issues.json`; `apps/storev2/dev.log` is tracked. `final-report.json` is explicitly excluded pending ownership proof.

### Domain and repository rule

Generated diagnostics belong in ignored scratch storage unless an external owner documents their review purpose.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- package.json .gitignore code-issues.json health-issues.json apps/storev2/dev.log` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- consumer/owner check
- untrack the two named snapshots and dev log
- redirect command to minimal ignored scratch path

**Files/path families allowed**
- `package.json`
- `.gitignore`
- `code-issues.json`
- `health-issues.json`
- `apps/storev2/dev.log`

**Out of scope**
- `final-report.json`
- quality tool behavior
- external dashboard changes

## Git workflow

- Branch: `audit/d-08-untrack-reproducible-reports-and-t`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner confirms no external dashboard/runbook ingests the exact tracked paths

Owner confirms no external dashboard/runbook ingests the exact tracked paths.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Remove the three generated files, redirect output, and add only the minimal ignore rule

Remove the three generated files, redirect output, and add only the minimal ignore rule.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Run quality JSON in a disposable/clean environment and inspect status

Run quality JSON in a disposable/clean environment and inspect status.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Quality JSON exits 0 and `git status --short` remains clean afterward; root `check-types` and `build` exit 0; no active consumer reference remains.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `D-08` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- An external consumer owns an exact path.
- `final-report.json` is pulled into scope.
- Redirect requires changing the quality tool itself.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Commit generated diagnostics only when ownership and review lifecycle are explicit.

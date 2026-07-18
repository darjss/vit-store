# Plan 019: Remove the install-only CI job

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- .github/workflows/ci.yml`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: D-04
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Suggested triage label**: `ready-for-human`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The `install` job installs dependencies but exports nothing and gates no job; the retained check job repeats setup/install. Removing it saves a runner only after confirming branch protection does not require its status name.

## Current state

**Baseline source:** `.github/workflows/ci.yml:12-20`

```yaml
jobs:
  install:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.0
      - uses: actions/cache@v4
```

### Domain and repository rule

Preserve the retained `astro-check` job and required status behavior. Do not modify branch protection in this plan.

### Existing-issue coordination

Coordinate directly with open CI issue #139.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- .github/workflows/ci.yml` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- read-only required-status check
- remove only the unconsumed install job

**Files/path families allowed**
- `.github/workflows/ci.yml`

**Out of scope**
- branch protection changes
- CI redesign
- removing install from the retained check

## Git workflow

- Branch: `audit/d-04-remove-the-install-only-ci-job`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Use read-only repository settings/API evidence to check required statuses and workflow consumers

Use read-only repository settings/API evidence to check required statuses and workflow consumers.

**Verify**: `git grep -n -E '^  install:|needs: install|astro-check' -- .github/workflows && gh api repos/darjss/vit-store/branches/v2/protection/required_status_checks` → workflow has no consumer of `install`; read-only branch data must not require its status name.

### Step 2: If `install` is not required, remove only that job

If `install` is not required, remove only that job. Validate YAML with already-available tooling.

**Verify**: `actionlint .github/workflows/ci.yml` if `command -v actionlint` succeeds; otherwise `ruby -e 'require "yaml"; YAML.load_file(ARGV[0]); puts "valid"' .github/workflows/ci.yml` → exit 0/`valid`, and `git grep -n '^  install:' .github/workflows/ci.yml` exits 1 with no output.

### Step 3: Observe a pull-request CI run after implementation

Observe a pull-request CI run after implementation.

**Verify**: **Prerequisites/setup:** Read-only branch-protection access and a PR run after workflow change.

**Bounded procedure:** Confirm required statuses before edit; push implementation PR and observe Actions checks without modifying branch protection.

**Machine-observable expected result:** Retained `astro-check` reports success, no missing required status appears, and redundant install job is absent.

**Cleanup:** No data cleanup; do not change repository settings.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `D-04` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Branch protection requires `install`.
- A consumer uses its name/output.
- No safe workflow parser is available or PR validation fails.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

CI setup jobs should export/gate something; required status names must be checked before deletion.

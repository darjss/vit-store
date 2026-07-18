# Plan 010: Refresh every cached purchase-list version after a write

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/admin/src/components/purchase/purchase-form.tsx apps/admin/src/routes/_dash/purchases.$id.tsx apps/admin/src/routes/_dash/purchases.index.tsx`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-04
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Purchase writes invalidate one literal first page, leaving filtered, sorted, searched, differently sized, or later pages stale. Both write completion paths should invalidate the generated procedure-key prefix and no unrelated cache.

## Current state

`purchase-form.tsx:107-115` invalidates `getPaginatedPurchases` only for `{ page: 1, pageSize: 10, sortDirection: "desc" }`; the detail route repeats it. The list route also uses search, provider, status, sort field, and page inputs.

### Domain and repository rule

Use the generated tRPC/TanStack Query key API already used in these files. Inspect live key shapes before choosing prefix matching.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/admin/src/components/purchase/purchase-form.tsx apps/admin/src/routes/_dash/purchases.$id.tsx apps/admin/src/routes/_dash/purchases.index.tsx` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- form and detail mutation success invalidation
- all input variants of `purchase.getPaginatedPurchases`

**Files/path families allowed**
- `apps/admin/src/components/purchase/purchase-form.tsx`
- `apps/admin/src/routes/_dash/purchases.$id.tsx`
- `apps/admin/src/routes/_dash/purchases.index.tsx`

**Out of scope**
- purchase API behavior
- list filters/sort semantics
- library upgrade
- broad cache clearing

## Git workflow

- Branch: `audit/b-04-refresh-every-cached-purchase-list`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Inspect query keys for default, filtered, sorted, and non-default-page lists in the running dashboard

Inspect query keys for default, filtered, sorted, and non-default-page lists in the running dashboard.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Use the smallest generated prefix invalidation in both success paths

Use the smallest generated prefix invalidation in both success paths. Confirm it matches only paginated purchase lists.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Open two list variants and mutate a disposable Purchase through the real dashboard

Open two list variants and mutate a disposable Purchase through the real dashboard.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Admin `check-types` and `build` exit 0. Both open list variants refresh without manual reload; unrelated query keys are not invalidated.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-04` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Input variants do not share a safe prefix.
- The prefix matches unrelated procedures.
- A write path bypasses both scoped callers.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

New Purchase list variants should stay under the same procedure prefix so one invalidation remains complete.

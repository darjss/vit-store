# Plan 008: Make Featured and New match their labels

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/queries/products/store.ts packages/api/src/routers/store/product.ts apps/storev2/src/components/product/products-list.tsx apps/storev2/src/components/product/filter-drawer.tsx apps/storev2/src/components/product/sort-bar.astro`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-02
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Featured browse filtering and its count use different inputs, while New has no explicit rule and falls back to stock ordering. One list-rule implementation must drive both displayed products and counts.

## Current state

**Baseline source:** `packages/api/src/queries/products/store.ts:673-684`

```ts
				listType,
				searchTerm,
				sortField = "stock",
				sortDirection = "desc",
			requireStock = false,
				minPrice,
				maxPrice,
			} = params;

			// Build filter conditions
			const conditions: (SQL<unknown> | undefined)[] = [];
			if (requireStock) conditions.push(gt(ProductsTable.stock, 0));
```

### Domain and repository rule

Keep active/non-deleted/status filters and deterministic tie-breaking. The UI labels “New” as `createdAt` descending, but that is evidence—not yet the approved contract.

### Existing-issue coordination

Coordinate with adjacent category count issue #163; this is distinct list semantics.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/queries/products/store.ts packages/api/src/routers/store/product.ts apps/storev2/src/components/product/products-list.tsx apps/storev2/src/components/product/filter-drawer.tsx apps/storev2/src/components/product/sort-bar.astro` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- approved Featured/New semantics
- shared conditions/default ordering used by infinite browse and count
- carry list choice into count request

**Files/path families allowed**
- `packages/api/src/queries/products/store.ts`
- `packages/api/src/routers/store/product.ts`
- `apps/storev2/src/components/product/products-list.tsx`
- `apps/storev2/src/components/product/filter-drawer.tsx`
- `apps/storev2/src/components/product/sort-bar.astro`

**Out of scope**
- home shortcuts
- search semantics beyond current count contract
- pagination/response changes
- catalog redesign

## Git workflow

- Branch: `audit/b-02-make-featured-and-new-match-their-`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner defines New (including equal timestamps) and confirms Featured count semantics

Owner defines New (including equal timestamps) and confirms Featured count semantics.

**Verify**: `git grep -n -E 'listType|recent|isFeatured|getInfiniteProducts|getPaginatedProducts' -- packages/api/src apps/storev2/src` → lists every Featured/New list and count caller; record the approved New ordering and tie-break before editing.

### Step 2: Centralize list conditions/order and pass list choice through both API paths and the filter drawer

Centralize list conditions/order and pass list choice through both API paths and the filter drawer.

**Verify**: `bun run check-types && bun run lint && bun run --cwd apps/storev2 check-types` → all exit 0; inspect the diff to confirm one list-rule owner feeds both retrieval and count inputs.

### Step 3: Use disposable catalog Products to compare browse pages and counts in a real browser/API call

Use disposable catalog Products to compare browse pages and counts in a real browser/API call.

**Verify**: **Prerequisites/setup:** Staging catalogue with disposable active Products: featured/non-featured and distinct/equal creation times; approved New rule.

**Bounded procedure:** Record expected IDs, use real API/browser to load Featured/New with filters and a second page, and record displayed totals.

**Machine-observable expected result:** Featured contains only marked Products and total equals set; New follows approved order/tie-break without duplicate/missing IDs across pages.

**Cleanup:** Remove/restore disposable Products and catalogue flags.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-02` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- New semantics or tie-break policy is undecided.
- Count must include unavailable search semantics.
- Another caller requires a conflicting `recent` contract.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Add future list types to the shared rule once so listing and counts cannot drift.

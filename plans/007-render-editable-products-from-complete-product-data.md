# Plan 007: Render editable products from complete product data

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/admin/src/routes/_dash/products.index.tsx apps/admin/src/components/product`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-01
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Instant search fabricates missing Product fields so a narrow result can enter the editable card. Saving can overwrite stored brand, category, description, tags, ingredients, or timestamps with placeholders. Search editing must use complete stored data or be view-only.

## Current state

**Baseline source:** `apps/admin/src/routes/_dash/products.index.tsx:303-314`

```tsx
								{instantSearchQuery.data?.map((product) => (
									<ProductCard
										key={product.id}
										product={
											{
												id: product.id,
												name: product.name,
												slug: product.slug,
												price: product.price,
												stock: product.stock,
												status: product.status as ProductListStatus,
												discount: 0,
```

### Domain and repository rule

The non-search branch in the same route supplies full-row Products to the same card and is the exemplar. Preserve ranking, card layout, and edit mutation shape.

### Existing-issue coordination

Coordinate with search issue #149 and separate mobile card issue #159; do not claim duplication.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/admin/src/routes/_dash/products.index.tsx apps/admin/src/components/product` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- instant-search render/query path only
- complete stored Product fetch or owner-approved view-only result

**Files/path families allowed**
- `apps/admin/src/routes/_dash/products.index.tsx`
- `apps/admin/src/components/product`

**Out of scope**
- API Product schema
- search ranking
- card design
- invented defaults or a second Product model

## Git workflow

- Branch: `audit/b-01-render-editable-products-from-comp`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Inventory every `ProductCard` field and confirm the same-route full-row query supplies stored values

Inventory every `ProductCard` field and confirm the same-route full-row query supplies stored values.

**Verify**: `git grep -n -E 'instantSearchQuery|<ProductCard|brandId: 0|createdAt: new Date' -- apps/admin/src/routes/_dash/products.index.tsx apps/admin/src/components/product` → identifies the fabricated editable object and complete Product-card callers.

### Step 2: Remove the fabricated editable object

Remove the fabricated editable object. Reuse the full-row list path; if measured latency is unacceptable, stop for a view-only decision.

**Verify**: `bun run --cwd apps/admin check-types && bun run --cwd apps/admin build && ! git grep -n -E 'brandId: 0|categoryId: 0|createdAt: new Date\(\)' -- apps/admin/src/routes/_dash/products.index.tsx` → checks exit 0 and fabricated editable defaults are absent.

### Step 3: Edit a disposable known Product from real dashboard search and verify untouched fields remain exact

Edit a disposable known Product from real dashboard search and verify untouched fields remain exact.

**Verify**: **Prerequisites/setup:** Staging dashboard and one disposable Product with non-empty brand, category, description, tags, ingredients, and stable timestamps.

**Bounded procedure:** Snapshot all fields, search for the Product, edit one harmless field from the result, save, and reload authoritative detail.

**Machine-observable expected result:** Edited field changes; every untouched field equals snapshot and no placeholder/zero/current timestamp is written.

**Cleanup:** Restore or soft-delete the disposable Product with the existing admin workflow.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-01` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- A required field is absent from the full-row query.
- Measured latency requires an unapproved view-only fallback.
- An API contract or ranking change becomes necessary.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Editable components only receive authoritative stored Product data; never pad a partial search type.

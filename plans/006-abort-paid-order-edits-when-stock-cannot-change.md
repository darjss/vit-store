# Plan 006: Abort paid Order edits when stock cannot change

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/routers/admin/order.ts packages/api/src/queries/products/index.ts packages/api/src/queries/payments.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: A-10
- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Paid Order edits update Order details, Payment, Sales records, and stock in one transaction, but required stock transitions may return no row and be ignored. The transaction must fail atomically whenever a required stock change cannot apply.

## Current state

**Baseline source:** `packages/api/src/routers/admin/order.ts:185-196`

```ts
                    if (transitionedToSuccess) {
                        const productCost = await getAverageCostOfProduct(tx, product.productId, new Date());
                        await tx.insert(SalesTable).values({
                            productCost: productCost,
                            quantitySold: product.quantity,
                            orderId: input.id,
                            sellingPrice: product.price,
                            productId: product.productId,
                        });
                        const transition = await applyStockTransition(tx, { productId: product.productId, delta: -product.quantity });
                        if (transition)
                            stockTransitions.push(transition);
```

### Domain and repository rule

Payment confirmation in `packages/api/src/queries/payments.ts:350-435` requires non-negative stock and throws inside its transaction. `CONTEXT.md` says transfer confirmation applies stock; pending Orders remain unchanged.

### Existing-issue coordination

Coordinate with adjacent storefront error issue #149; this targets admin paid edits.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/routers/admin/order.ts packages/api/src/queries/products/index.ts packages/api/src/queries/payments.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- all required stock transitions in admin paid-Order edit transaction
- existing helper contract only if clarification is needed

**Files/path families allowed**
- `packages/api/src/routers/admin/order.ts`
- `packages/api/src/queries/products/index.ts`
- `packages/api/src/queries/payments.ts`

**Out of scope**
- new negative-stock override UX
- stock policy redesign
- pending Order behavior
- Sales redesign
- router reorganization

## Git workflow

- Branch: `audit/a-10-abort-paid-order-edits-when-stock-`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner confirms whether a deliberate negative-stock override exists

Owner confirms whether a deliberate negative-stock override exists. If yes, stop and scope that separately; accidental omission is not an override.

**Verify**: `git grep -n -E 'applyStockTransition|requireNonNegative|transitionedToSuccess' -- packages/api/src/routers/admin/order.ts packages/api/src/queries/payments.ts` → lists every paid-edit transition plus the mandatory confirmation exemplar; record whether a named negative-stock override exists.

### Step 2: Require every paid-edit stock transition result and throw inside the existing transaction before commit

Require every paid-edit stock transition result and throw inside the existing transaction before commit.

**Verify**: `bun run check-types && git grep -n -A3 -B2 'applyStockTransition' packages/api/src/routers/admin/order.ts` → typecheck exits 0 and every required paid-edit transition is followed by a throw/mandatory-result branch, not an optional push.

### Step 3: Through the real admin/API boundary, prove valid, deleted-product, and insufficient-stock edits with disposable records

Through the real admin/API boundary, prove valid, deleted-product, and insufficient-stock edits with disposable records.

**Verify**: **Prerequisites/setup:** Staging dashboard/API, disposable paid Orders and Products for valid, deleted/inactive, and insufficient-stock cases; authorized row inspection.

**Bounded procedure:** Snapshot Order, Payment, sales, and stock; submit each paid edit through the real admin boundary.

**Machine-observable expected result:** Valid edit commits all expected changes; each invalid case returns an error and all four snapshots remain unchanged.

**Cleanup:** Delete/cancel disposable Orders and restore Product status/stock through existing admin cleanup.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `A-10` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Negative stock is an intentional but undocumented staff operation.
- A missing transition is approved for a named legacy case.
- Atomicity would require moving work outside the existing transaction.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Review every new paid-edit branch for an explicit, mandatory stock-transition result.

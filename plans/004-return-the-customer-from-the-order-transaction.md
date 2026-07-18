# Plan 004: Return the Customer from the Order transaction

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/order.ts packages/api/src/routers/store/auth.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: A-09
- **Priority**: P0
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Order, Payment, and Customer writes commit before a detached Customer lookup builds checkout session data. If that lookup fails, checkout returns an error after committed writes. Returning the inserted/updated Customer from the transaction removes that post-commit failure without changing checkout claims.

## Current state

`packages/api/src/routers/store/order.ts:230-239`:
```ts
const user = await addCustomerToDB(input.phoneNumber);
if (!user) {
  throw new Error("Failed to create user");
}
```

### Domain and repository rule

The same transaction already reads `CustomersTable`. `CONTEXT.md` defines Customer identity by phone and Order ownership through `customerPhone`; preserve `createCheckoutAccessToken` and current address fields.

### Existing-issue coordination

Coordinate with adjacent order-error issue #149; this is not claimed as a duplicate.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/order.ts packages/api/src/routers/store/auth.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- `order.addOrder` transaction result and session construction
- narrow Customer transaction helper only if required

**Files/path families allowed**
- `packages/api/src/routers/store/order.ts`
- `packages/api/src/routers/store/auth.ts`

**Out of scope**
- Order idempotency design
- public response or checkout-token changes
- A-04 address authorization
- notification behavior

## Git workflow

- Branch: `audit/a-09-return-the-customer-from-the-order`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Confirm the transaction’s inserted and existing-Customer branches and every field required by the checkout session

Confirm the transaction’s inserted and existing-Customer branches and every field required by the checkout session.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Return the complete Customer row with `orderId` and `paymentNumber`; if needed, select it inside the same transaction

Return the complete Customer row with `orderId` and `paymentNumber`; if needed, select it inside the same transaction. Remove only the detached lookup and obsolete failure branch.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Call the real API with disposable absent and existing Customers

Call the real API with disposable absent and existing Customers.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

`bun run check-types` exits 0; `git grep -n addCustomerToDB packages/api/src/routers/store/order.ts` has no match. Each proof returns valid existing session claims and creates one Order and Payment with expected address data.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `A-09` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- The transaction cannot produce all existing session fields without invented defaults.
- A caller depends on a changed exported helper contract.
- The public response or token claims would change.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Keep response-critical reads inside the write transaction when they depend on newly committed rows.

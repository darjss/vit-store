# Plan 014: Use one QPay create-and-store function

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/order.ts packages/api/src/routers/store/payment.ts packages/api/src/lib/payments/qpay.ts packages/api/src/lib/trpc.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: S-03
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/004-return-the-customer-from-the-order-transaction.md
- **Category**: tech-debt
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Eager checkout and fallback QR creation duplicate amount conversion, provider call, cache/database writes, and tracking. The eager promise is detached. One Payment-owned operation should preserve fallback behavior and use the Worker lifecycle for non-fatal eager work.

## Current state

**Baseline source:** `packages/api/src/routers/store/order.ts:19-28`

```ts
/**
 * Fire-and-forget: pre-create the QPay invoice so the QR is ready in KV
 * before the user reaches the payment page. `createQr` is the fallback
 * when this misses (invoice expired, pre-create failed, >1h delay).
 * Mirrors the createQr procedure in payment.ts — same dev `/10000` amount
 * hack, same KV key + 1h TTL, same provider/invoiceId write, same tracking.
 */
async function precreateQpayInvoice(paymentNumber: string): Promise<void> {
    const payment = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
    if (!payment || payment.status === "success") {
```

### Domain and repository rule

ADR-0004 keeps QPay separate from transfer claims. Preserve access checks, success guard, cache TTL/key, Payment provider/invoice fields, response, and existing sequential behavior.

### Existing-issue coordination

Coordinate with payment launch issue #125; keep this narrow.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/order.ts packages/api/src/routers/store/payment.ts packages/api/src/lib/payments/qpay.ts packages/api/src/lib/trpc.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- one shared Payment-owned create/store operation
- fallback awaiting it
- eager work registered with the existing execution context

**Files/path families allowed**
- `packages/api/src/routers/store/order.ts`
- `packages/api/src/routers/store/payment.ts`
- `packages/api/src/lib/payments/qpay.ts`
- `packages/api/src/lib/trpc.ts`

**Out of scope**
- provider credentials/config
- concurrent-miss idempotency
- TTL change
- Payment UI
- transfer flow

## Git workflow

- Branch: `audit/s-03-use-one-qpay-create-and-store-func`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner confirms whether eager and fallback persistence order is contractual; inspect available request `waitUntil`

Owner confirms whether eager and fallback persistence order is contractual; inspect available request `waitUntil`.

**Verify**: `git grep -n -E 'precreateQpayInvoice|createQr|createQpayInvoice|waitUntil|QPAY:' -- packages/api/src apps/server/src` → shows both duplicated paths and whether the request lifecycle is available; record persistence-order compatibility.

### Step 2: Extract one helper and replace both copies

Extract one helper and replace both copies. Keep eager failure non-fatal but safely logged and lifecycle-registered.

**Verify**: `bun run check-types && test "$(git grep -l 'createQpayInvoice' -- packages/api/src/routers/store/order.ts packages/api/src/routers/store/payment.ts | wc -l)" -le 1` → typecheck exits 0 and at most one route-level implementation remains (provider boundary excluded).

### Step 3: With disposable Payment and configured provider bindings, prove eager, cache-miss fallback, repeat lookup, and success-state rejection

With disposable Payment and configured provider bindings, prove eager, cache-miss fallback, repeat lookup, and success-state rejection.

**Verify**: **Prerequisites/setup:** Non-production QPay bindings, disposable pending Payment, observable KV/Payment state, and approved persistence-order contract.

**Bounded procedure:** Prove eager creation after checkout, delete/expire only the disposable KV entry, invoke fallback, repeat lookup, then invoke against success Payment.

**Machine-observable expected result:** Eager/fallback return existing shape and persist same fields/order; repeat reuses stored invoice sequentially; success is rejected; no unhandled rejection/secret log.

**Cleanup:** Delete disposable KV entry and Payment/Order through existing non-production workflow.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `S-03` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Write order intentionally differs.
- No execution context is available at the router boundary and cannot be passed from the Worker boundary.
- Concurrent-miss semantics would change.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Provider persistence changes belong in the shared operation; do not reintroduce route-local copies.

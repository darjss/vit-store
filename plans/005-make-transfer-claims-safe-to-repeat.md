# Plan 005: Make transfer claims safe to repeat

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/queries/payments.ts packages/api/src/routers/store/payment.ts apps/agent/src/lib/payment.ts apps/agent/src/channels/payment-handler.ts apps/agent/cli/payment-proof.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: A-07
- **Priority**: P0
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

A replayed transfer claim currently performs an unconditional Payment status write and can repeat an Admin alert. Only `pending` may become `customer_claimed_paid`; repeated claims must be harmless and closed Payments must never move backward.

## Current state

`packages/api/src/queries/payments.ts:530-537`:
```ts
async updatePaymentStatus(paymentNumber: string, status: PaymentStatus) {
  return db().update(PaymentsTable).set({ status })
    .where(eq(PaymentsTable.paymentNumber, paymentNumber)).returning();
}
```

### Domain and repository rule

ADR-0004: a transfer claim is not transfer confirmation. Storefront reconciliation and Messenger claim-only behavior remain separate. Match conditional-update style in the same payments query module.

### Existing-issue coordination

Coordinate with broad issues #125 and #149; preserve ADR-0004 and do not claim duplication.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/queries/payments.ts packages/api/src/routers/store/payment.ts apps/agent/src/lib/payment.ts apps/agent/src/channels/payment-handler.ts apps/agent/cli/payment-proof.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- one Payment-owned conditional claim operation
- storefront and Messenger callers consuming its outcome
- alert only on a new claim

**Files/path families allowed**
- `packages/api/src/queries/payments.ts`
- `packages/api/src/routers/store/payment.ts`
- `apps/agent/src/lib/payment.ts`
- `apps/agent/src/channels/payment-handler.ts`
- `apps/agent/cli/payment-proof.ts`

**Out of scope**
- transfer confirmation
- QPay
- Payment status vocabulary/schema
- old Messenger receiver
- making Messenger start reconciliation

## Git workflow

- Branch: `audit/a-07-make-transfer-claims-safe-to-repea`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner chooses the Customer-facing result for claims against `success` or `failed`; record it before editing

Owner chooses the Customer-facing result for claims against `success` or `failed`; record it before editing.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Implement one conditional transition with outcomes such as changed/already-claimed/closed; update callers without merging their distinct behavior

Implement one conditional transition with outcomes such as changed/already-claimed/closed; update callers without merging their distinct behavior.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Run focused Messenger/payment proof and repeat the same disposable claim

Run focused Messenger/payment proof and repeat the same disposable claim.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

`bun run check-types` exits 0. Two deliveries create one transition and one Admin alert; success/failed Payments stay unchanged; no stock confirmation occurs. Use `bun run --cwd apps/agent payment:proof` if its environment prerequisites are configured.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `A-07` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- No closed-state response policy is approved.
- A caller relies on unconditional demotion.
- Messenger claims are requested to start reconciliation; that requires a separate ADR/product decision.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Every new claim caller must act on the transition outcome; alerts are emitted only for `changed`.

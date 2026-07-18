# Plan 016: List the admin functions the assistant already has

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/assistant/src/admin/instructions.ts packages/assistant/src/admin/read-fns.ts packages/assistant/src/admin/codemode-tool.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: S-05
- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The admin assistant registry exposes claimed-transfer count and list reads, but the model-facing instructions omit them. Naming the existing functions lets an authorized User request those reads without changing capabilities.

## Current state

**Baseline source:** `packages/assistant/src/admin/read-fns.ts:109-117`

```ts
			name: "payment",
			fns: {
				getPayments: async (input: unknown) => botClient.payment.getPayments.query(input as never),
				getPendingPayments: async () => botClient.payment.getPendingPayments.query(),
				getPendingMessengerNotifications: async () => botClient.payment.getPendingMessengerNotifications.query(),
				getClaimedTransferCount: async () => botClient.payment.getClaimedTransferCount.query(),
				getClaimedTransferPayments: async () => botClient.payment.getClaimedTransferPayments.query(),
				createPayment: async (input: unknown) => botClient.payment.createPayment.mutate(input as never),
				confirmTransferPayment: async (input: unknown) => botClient.payment.confirmTransferPayment.mutate(input as never),
```

### Domain and repository rule

ADR-0008 keeps the admin assistant as Codemode with one query tool. A transfer claim is not transfer confirmation; do not imply otherwise.

### Existing-issue coordination

Coordinate with broad Messenger PRD #16; no exact overlap.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/assistant/src/admin/instructions.ts packages/assistant/src/admin/read-fns.ts packages/assistant/src/admin/codemode-tool.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- two concise instruction entries after signature verification

**Files/path families allowed**
- `packages/assistant/src/admin/instructions.ts`
- `packages/assistant/src/admin/read-fns.ts`
- `packages/assistant/src/admin/codemode-tool.ts`

**Out of scope**
- registry/router changes
- new procedures
- generated instructions
- Payment transition changes

## Git workflow

- Branch: `audit/s-05-list-the-admin-functions-the-assis`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Confirm both no-argument procedures exist in the deployed `BotRouter` contract

Confirm both no-argument procedures exist in the deployed `BotRouter` contract.

**Verify**: `git grep -n -E 'getClaimedTransferCount|getClaimedTransferPayments|payment management' -- packages/assistant/src packages/api/src` → both no-argument reads exist and only their model-facing instruction entries are missing.

### Step 2: Add concise function names and meanings to the existing payment instruction section

Add concise function names and meanings to the existing payment instruction section.

**Verify**: `bun run check-types && bun run build && git grep -n -E 'getClaimedTransferCount|getClaimedTransferPayments' packages/assistant/src/admin/instructions.ts` → checks exit 0 and each existing read is named in model-facing instructions.

### Step 3: On a configured test Page, ask an authorized admin assistant for count and list using synthetic data

On a configured test Page, ask an authorized admin assistant for count and list using synthetic data.

**Verify**: **Prerequisites/setup:** Configured test Page, authorized disposable admin Messenger conversation, and synthetic claimed-transfer Payments.

**Bounded procedure:** Ask for claimed-transfer count, then bounded list; capture selected function names and response language.

**Machine-observable expected result:** Assistant selects each existing read, count/list agree, output is bounded, and no claim is described as confirmation.

**Cleanup:** Delete synthetic records and private conversation capture; retain only sanitized function-selection evidence.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `S-05` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- A procedure is absent from deployed BotRouter or takes input.
- The request expands into instruction generation or a new capability.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

When read functions change, update the hand-written capability list in the same change; revisit generation only after another real drift case.

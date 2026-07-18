# Plan 012: Restore Delivery zone confirmation and Order notes

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/assistant/src/checkout.ts packages/assistant/src/checkout-tools.ts apps/agent/scripts/checkout-sim.ts apps/agent/cli/payment-proof.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-06
- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Messenger checkout already models explicit Delivery zone confirmation and optional Order notes, but its tools silently choose the first candidate and skip notes. The tools must follow the existing state machine before final Order confirmation.

## Current state

**Baseline source:** `packages/assistant/src/checkout-tools.ts:194-205`

```ts
			// making the customer pick one, then jump straight to the summary for a
			// single confirm. The chosen zone is shown in the summary, so the
			// customer can still object before the order is placed.
			if (candidates.length === 0) {
				return advance(withCandidates, formatZoneCandidates(candidates));
			}
			const zoned = applyZoneSelection(withCandidates, candidates[0]!.zoneId);
			if (!zoned.ok) {
				return advance(withCandidates, formatZoneCandidates(candidates));
			}
			const confirming = applyNotes(zoned.state, undefined);
			const saved = await deps.saveCheckout(confirming);
```

### Domain and repository rule

ADR-0005 and `CONTEXT.md` require Customer confirmation among surfaced candidates until resolver evaluation supports automation. `order.addOrder` remains authoritative for Delivery fee and total.

### Existing-issue coordination

Coordinate with #149 asset QA and #172 delivery copy/loading work; neither duplicates state flow.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/assistant/src/checkout.ts packages/assistant/src/checkout-tools.ts apps/agent/scripts/checkout-sim.ts apps/agent/cli/payment-proof.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- checkout tool descriptions/control flow
- existing state transitions only if necessary
- existing CLI simulations as proof harnesses

**Files/path families allowed**
- `packages/assistant/src/checkout.ts`
- `packages/assistant/src/checkout-tools.ts`
- `apps/agent/scripts/checkout-sim.ts`
- `apps/agent/cli/payment-proof.ts`

**Out of scope**
- resolver accuracy/automatic selection
- address normalization
- storefront checkout
- zone data
- QPay

## Git workflow

- Branch: `audit/b-06-restore-delivery-zone-confirmation`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Confirm baseline phases/tools and simulations still represent address → zone → notes → final confirmation

Confirm baseline phases/tools and simulations still represent address → zone → notes → final confirmation.

**Verify**: `git grep -n -E 'confirming_zone|applyZoneSelection|applyNotes|confirm_delivery_zone|provide_notes' -- packages/assistant apps/agent` → proves the state machine and proof harness already contain zone and notes phases.

### Step 2: Make address show candidates only; valid zone selection prompts notes; explicit notes or skip advances to final summary

Make address show candidates only; valid zone selection prompts notes; explicit notes or skip advances to final summary.

**Verify**: `bun run check-types && bun run --cwd apps/agent checkout:sim` → typecheck exits 0 and simulation output reaches zone confirmation, then notes, then final confirmation before Order creation.

### Step 3: Run checkout simulation and real configured assistant CLI with disposable input

Run checkout simulation and real configured assistant CLI with disposable input.

**Verify**: **Prerequisites/setup:** Configured Agent CLI with disposable cart/Customer input and delivery candidates; no real Customer conversation.

**Bounded procedure:** Run `bun run --cwd apps/agent checkout:sim`, then real CLI flow choosing an unoffered zone, a valid zone, and explicit empty notes before final confirmation.

**Machine-observable expected result:** Unoffered zone is rejected; valid zone reaches notes; skip reaches final summary; exactly one Order appears only after final confirmation.

**Cleanup:** Cancel/delete the disposable Order and clear the CLI checkout state via its existing non-production workflow.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-06` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- The owner requests silent auto-selection without replacing ADR-0005 with resolver evidence.
- The change requires resolver/storefront scope.
- Final confirmation or fee authority would move.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Keep tool control flow aligned with pure checkout phases; resolver automation needs a separate measured decision.

# Plan 015: Attempt both scheduled jobs every time

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/server/src/index.ts apps/server/src/lib/restock-notifier.ts apps/server/src/lib/payment-notification-outbox.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: S-04
- **Priority**: P2
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The scheduled handler awaits restock work before Payment notification work, so the second independent job is skipped when the first throws. Both must start and settle on every trigger, with an explicit overall failure policy.

## Current state

**Baseline source:** `apps/server/src/index.ts:125-130`

```ts
export default {
	fetch: app.fetch,
	scheduled: async (_controller: ScheduledController, env: Env) => {
		await runRestockNotifier(env);
		await runPaymentNotificationOutbox();
	},
```

### Domain and repository rule

Keep each job’s current logging, lease, retry, and error behavior. Only orchestration changes; safe summary logs contain job names/outcomes, not Customer or Payment content.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/server/src/index.ts apps/server/src/lib/restock-notifier.ts apps/server/src/lib/payment-notification-outbox.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- Worker scheduled orchestration
- approved final reject/success policy after both settle

**Files/path families allowed**
- `apps/server/src/index.ts`
- `apps/server/src/lib/restock-notifier.ts`
- `apps/server/src/lib/payment-notification-outbox.ts`

**Out of scope**
- job internals
- new retry/queue/scheduler
- Cron configuration
- notification content

## Git workflow

- Branch: `audit/s-04-attempt-both-scheduled-jobs-every-`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Operations chooses whether any job failure should reject the scheduled invocation after both settle

Operations chooses whether any job failure should reject the scheduled invocation after both settle.

**Verify**: `git grep -n -E 'runRestockNotifier|runPaymentNotificationOutbox|scheduled:' -- apps/server/src` → exactly the two independent jobs and their Worker orchestrator; record the approved aggregate failure policy.

### Step 2: Start both promises before `Promise

Start both promises before `Promise.allSettled`; account safely for each outcome and apply approved final policy.

**Verify**: `bun run --cwd apps/server check-types && ! git grep -n 'await runRestockNotifier(env);' -- apps/server/src/index.ts` → typecheck exits 0 and the sequential first await is gone; both promises are created before settlement.

### Step 3: Invoke a disposable/local Worker harness with each dependency failing in turn

Invoke a disposable/local Worker harness with each dependency failing in turn.

**Verify**: **Prerequisites/setup:** Local Worker harness with disposable dependencies that can make each job fail before external delivery; approved overall failure policy.

**Bounded procedure:** Invoke scheduled handler three times: restock fails, outbox fails, both succeed; capture safe job-attempt markers and final promise result.

**Machine-observable expected result:** Both markers appear once per invocation; final resolve/reject matches approved policy; job-internal retry/log behavior is unchanged.

**Cleanup:** Remove temporary harness/config and disposable outbox/restock records; no production Cron invocation.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `S-04` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Final Cron failure/alerting policy is undecided.
- Jobs share an undocumented transaction or lock requiring ordering.
- Proof would require production data.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

New independent scheduled work must not be sequenced behind another job’s success.

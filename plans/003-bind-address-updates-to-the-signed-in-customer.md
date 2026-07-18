# Plan 003: Bind address updates to the signed-in Customer

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/customer.ts packages/api/src/db/valibot.ts packages/api/src/lib/trpc.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: A-04
- **Priority**: P0
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The procedure authenticates a Customer but lets request data choose the Customer row. Binding the update to the session phone prevents one Customer from changing another Customer’s address and narrows the input to the one editable field.

## Current state

**Baseline source:** `packages/api/src/routers/store/customer.ts:9-16`

```ts
	updateAddress: customerProcedure
		.input(updateCustomerSchema)
		.mutation(async ({ input }) => {
			const q = customerQueries.store;
			const { address, phone } = input;
			await q.updateCustomerAddress(phone as number, address);
		}),
});
```

### Domain and repository rule

`customerProcedure` supplies `ctx.session`; `CONTEXT.md` defines Customer identity by unique phone. Preserve the procedure’s current return behavior.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/customer.ts packages/api/src/db/valibot.ts packages/api/src/lib/trpc.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- address-only input for this procedure
- session-owned phone selection
- remove the old schema export only if no caller remains

**Files/path families allowed**
- `packages/api/src/routers/store/customer.ts`
- `packages/api/src/db/valibot.ts`
- `packages/api/src/lib/trpc.ts`

**Out of scope**
- Customer identity/session redesign
- Customer creation or Order address fields
- admin Customer editing
- silent legacy-client compatibility policy

## Git workflow

- Branch: `audit/a-04-bind-address-updates-to-the-signed`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Inspect the session type and all procedure callers/imports

Inspect the session type and all procedure callers/imports. Confirm session phone is canonical and whether an external client still sends `phone`.

**Verify**: `git grep -n -E 'updateAddress|updateCustomerSchema|updateCustomerAddress|customerProcedure' -- packages/api/src` → lists the mutation, schema, query, and authenticated procedure; no tracked application caller supplies a required alternate owner.

### Step 2: Replace whole-row input with address-only validation and call the existing query with the session Customer phone

Replace whole-row input with address-only validation and call the existing query with the session Customer phone. Delete the shared update schema only if repository search proves it dead.

**Verify**: `bun run check-types && ! git grep -n 'updateCustomerAddress(phone as number' -- packages/api/src/routers/store/customer.ts` → typecheck exits 0 and the request phone no longer selects the row.

### Step 3: Exercise two disposable authenticated Customers through the real API

Exercise two disposable authenticated Customers through the real API.

**Verify**: **Prerequisites/setup:** Local/staging API, two disposable Customers A/B with distinct phones, authenticated session for A, and authorized read access to both rows.

**Bounded procedure:** Snapshot both addresses; submit the address-only mutation as A and, if compatibility input remains, include B phone as ignored data.

**Machine-observable expected result:** Only A address changes; B and every non-address field remain byte-for-byte equal; response shape is unchanged.

**Cleanup:** Restore both addresses or delete both disposable Customers using the environment’s existing cleanup workflow.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `A-04` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Session phone is not the canonical Customer key.
- A live client needs fields beyond address or needs an undecided compatibility rollout.
- The schema is shared by another procedure.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Keep ownership-sensitive selectors server-derived; never reintroduce Customer identity in this mutation input.

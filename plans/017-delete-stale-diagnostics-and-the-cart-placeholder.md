# Plan 017: Delete stale diagnostics and the cart placeholder

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/cart.ts apps/storev2/src/pages/audit.astro apps/storev2/src/pages/benchmark.astro apps/storev2/src/pages/test.astro apps/storev2/src/components/benchmark-comparison.tsx apps/storev2/astro.config.mjs packages/api/src/routers/store/product.ts packages/api/src/lib/benchmark/product-benchmark.ts apps/admin/src/routes/_dash/sandbox.tsx apps/admin/src/routeTree.gen.ts packages/api/src/routers/admin/product.ts packages/api/src/queries/products/admin.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: D-01
- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Suggested triage label**: `ready-for-human`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Unlinked fixed audit/test/benchmark routes, benchmark procedures, an admin sandbox, and a starter cart greeting remain reachable without supporting Customer shopping or User work. Safe deletion requires sanitized access and runbook evidence first.

## Current state

**Baseline source:** `packages/api/src/routers/store/cart.ts:5-12`

```ts
export const cart = router({
	hello: publicProcedure
		.input(v.object({ text: v.string() }))
		.query(({ input }) => {
			return {
				greeting: `Hello ${input.text}`,
			};
		}),
```

### Domain and repository rule

Keep documented health monitoring and all real catalog/cart/admin behavior. Regenerate admin routes; never hand-edit generated output. The discussion-only production photo diagnostic is expressly not in this plan.

### Existing-issue coordination

Coordinate with go-live issue #125; do not close or modify it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/routers/store/cart.ts apps/storev2/src/pages/audit.astro apps/storev2/src/pages/benchmark.astro apps/storev2/src/pages/test.astro apps/storev2/src/components/benchmark-comparison.tsx apps/storev2/astro.config.mjs packages/api/src/routers/store/product.ts packages/api/src/lib/benchmark/product-benchmark.ts apps/admin/src/routes/_dash/sandbox.tsx apps/admin/src/routeTree.gen.ts packages/api/src/routers/admin/product.ts packages/api/src/queries/products/admin.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- sanitized access/owner inventory for each exact surface
- delete only unused diagnostic routes, direct benchmark procedures/libs, sandbox, and placeholder
- generated route cleanup

**Files/path families allowed**
- `packages/api/src/routers/store/cart.ts`
- `apps/storev2/src/pages/audit.astro`
- `apps/storev2/src/pages/benchmark.astro`
- `apps/storev2/src/pages/test.astro`
- `apps/storev2/src/components/benchmark-comparison.tsx`
- `apps/storev2/astro.config.mjs`
- `packages/api/src/routers/store/product.ts`
- `packages/api/src/lib/benchmark/product-benchmark.ts`
- `apps/admin/src/routes/_dash/sandbox.tsx`
- `apps/admin/src/routeTree.gen.ts`
- `packages/api/src/routers/admin/product.ts`
- `packages/api/src/queries/products/admin.ts`

**Out of scope**
- production photo diagnostic
- owned health endpoint
- real Customer cart/order paths
- unrelated admin Product CRUD

## Git workflow

- Branch: `audit/d-01-delete-stale-diagnostics-and-the-c`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Operator records last access and owner/runbook status for each surface without copying identifiers or Customer data

Operator records last access and owner/runbook status for each surface without copying identifiers or Customer data.

**Verify**: `git grep -n -E 'cart.hello|getProductBenchmark|runProductBenchmark|audit.astro|benchmark.astro|test.astro|sandbox' -- packages/api/src apps/admin/src apps/storev2/src` → inventories every accepted deletion surface and direct caller; append sanitized access-owner evidence before deletion.

### Step 2: If and only if unused/unowned, remove each route and direct server implementation; regenerate admin routes

If and only if unused/unowned, remove each route and direct server implementation; regenerate admin routes. Preserve any surface with a live owner.

**Verify**: `bun run --cwd apps/admin build && bun run check-types && bun run lint && bun run build && ! git grep -n -E 'cart.hello|getProductBenchmark|runProductBenchmark' -- packages/api/src apps/admin/src apps/storev2/src` → the admin build regenerates routes, all checks exit 0, and accepted surfaces have no direct implementation/caller.

### Step 3: Check removed staging URLs/procedures are absent while health, catalog, and dashboard continue through real boundaries

Check removed staging URLs/procedures are absent while health, catalog, and dashboard continue through real boundaries.

**Verify**: **Prerequisites/setup:** Sanitized access logs/runbooks and staging deployment; owner approval recorded for every accepted route/procedure.

**Bounded procedure:** Before deletion record last-use/owner result; after deployment request each removed URL/procedure and one retained health/catalog/dashboard path.

**Machine-observable expected result:** Removed surfaces return project not-found/absent procedure; retained paths work; no accepted surface with live owner was deleted.

**Cleanup:** No disposable data required; remove temporary sanitized access summaries after attaching approved evidence.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `D-01` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Any surface has live access, monitoring, staff workflow, or external integration without owner approval.
- Route generation drifts or the replacement health owner cannot be proved.
- Work reaches the discussion-only production photo diagnostic.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Diagnostics need explicit owner, authentication, retention, and runbook; otherwise remove them when obsolete.

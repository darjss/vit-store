# Plan 002: Place product creation inside the signed-in admin area

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/admin/src/routes/products.add.tsx apps/admin/src/routes/_dash/route.tsx apps/admin/src/routeTree.gen.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: A-03
- **Priority**: P0
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Suggested triage label**: `ready-for-agent`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

The product-creation route currently belongs to the public root, so a signed-out visitor can load its shell. Moving only its file-route parent makes the existing dashboard session redirect and frame apply without changing the public URL or save behavior.

## Current state

`apps/admin/src/routes/products.add.tsx:14-16`:
```ts
export const Route = createFileRoute("/products/add")({
  component: RouteComponent,
});
```
`apps/admin/src/routes/_dash/route.tsx:8-10` is the signed-in pathless parent.

### Domain and repository rule

TanStack file routing determines ancestry from the source filename. `routeTree.gen.ts` is generated output; never hand-edit it. A staff principal is a **User**.

### Existing-issue coordination

No exact open issue was found.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/admin/src/routes/products.add.tsx apps/admin/src/routes/_dash/route.tsx apps/admin/src/routeTree.gen.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- move/rename the route source beneath `_dash` while retaining `/products/add`
- regenerated route tree

**Files/path families allowed**
- `apps/admin/src/routes/products.add.tsx`
- `apps/admin/src/routes/_dash/route.tsx`
- `apps/admin/src/routeTree.gen.ts`

**Out of scope**
- form/save authorization
- login/session semantics
- URL or navigation changes
- manual generated-file edits

## Git workflow

- Branch: `audit/a-03-place-product-creation-inside-the-`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Confirm the admin route generator command from installed project tooling; do not invent a package script

Confirm the admin route generator command from installed project tooling; do not invent a package script.

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Move the source into the `_dash` route family and regenerate the tree

Move the source into the `_dash` route family and regenerate the tree. Confirm the parent is `_dash` and URL remains `/products/add`.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Browser-check signed-out redirect and signed-in dashboard rendering/save behavior

Browser-check signed-out redirect and signed-in dashboard rendering/save behavior.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

`bun run --cwd apps/admin check-types` and `bun run --cwd apps/admin build` exit 0. At `/products/add`, signed-out navigation redirects to `/login` before form render; a disposable signed-in User sees the same form inside the dashboard and can complete the existing save flow.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `A-03` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- Product creation is intentionally public.
- Generation changes unrelated route parents or the public URL.
- The signed-in page loses the dashboard frame.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Future signed-in dashboard pages belong under `_dash`; source file ownership, not generated-tree patching, is the durable rule.

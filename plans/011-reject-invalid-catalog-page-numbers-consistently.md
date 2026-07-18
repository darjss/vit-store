# Plan 011: Reject invalid catalog page numbers consistently

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- apps/storev2/src/pages/products/category/[slug]/[page].astro apps/storev2/src/pages/products/brand/[slug]/[page].astro packages/api/src/routers/store/product.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-05
- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Category and brand routes parse page text loosely and disagree on empty/out-of-range handling. Invalid text can reach the API or render empty pages. Both route families need one explicit positive-integer and past-end policy.

## Current state

**Baseline source:** `apps/storev2/src/pages/products/category/[slug]/[page].astro:16-18`

```ts
const { slug, page: pageParam } = Astro.params;
const page = Number.parseInt(pageParam!, 10);

```

### Domain and repository rule

The API requires integer `page >= 1`. Preserve page size 24, sort query handling, canonical URLs, and the project’s `/404` behavior.

### Existing-issue coordination

Coordinate with broader catalog URL issues #165 and #167; no duplicate claim.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- apps/storev2/src/pages/products/category/[slug]/[page].astro apps/storev2/src/pages/products/brand/[slug]/[page].astro packages/api/src/routers/store/product.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- one approved parser/policy for category and brand pages
- pre-query invalid redirect
- post-query past-end handling

**Files/path families allowed**
- `apps/storev2/src/pages/products/category/[slug]/[page].astro`
- `apps/storev2/src/pages/products/brand/[slug]/[page].astro`
- `packages/api/src/routers/store/product.ts`

**Out of scope**
- catalog query semantics
- trailing-slash conventions
- category/brand lookup redesign
- cache redesign

## Git workflow

- Branch: `audit/b-05-reject-invalid-catalog-page-number`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner chooses leading-zero, empty-catalog, and invalid/past-end destination policy

Owner chooses leading-zero, empty-catalog, and invalid/past-end destination policy.

**Verify**: `git grep -n -E 'Number.parseInt\(pageParam|totalPages|Astro.redirect\("/404' -- apps/storev2/src/pages/products packages/api/src/routers/store/product.ts` → lists both category/brand parsers and existing bounds/404 rules; record leading-zero and empty-catalog decisions.

### Step 2: Implement/reuse a full positive-integer parser in both routes and apply the same past-end rule

Implement/reuse a full positive-integer parser in both routes and apply the same past-end rule.

**Verify**: `bun run --cwd apps/storev2 check-types && bun run lint` → both exit 0; both route files import/use the same strict parser or contain byte-identical validation logic.

### Step 3: Use browser/curl on known disposable/read-only category and brand URLs for valid, zero, malformed, partial, and past-end pages

Use browser/curl on known disposable/read-only category and brand URLs for valid, zero, malformed, partial, and past-end pages.

**Verify**: **Prerequisites/setup:** Running staging storefront with one known non-empty category and brand and known total pages; no writes required.

**Bounded procedure:** Request valid page 1, zero, negative, alphabetic, partial numeric, decimal, leading-zero, and past-end URLs for both route families using `curl -sS -o /dev/null -D - <URL>`.

**Machine-observable expected result:** Valid in-range requests render; every rejected form has the approved status/location and no 500; pre-query invalid forms produce no Product API request in request logs.

**Cleanup:** No data cleanup; remove only temporary response-header files.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-05` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- The two route families intentionally need different policies.
- The API supports a page form the route would reject.
- Cache/SSR behavior prevents the approved pre-query handling.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Any new paginated catalog route must reuse the same URL-page policy.

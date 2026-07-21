# Plan 013: Preserve old Product links when a slug changes

> **Executor instructions**: Read this plan completely. Run each gate and preserve end-to-end behavior except the stated correction. Do not add unit or integration tests. Use disposable data for real-system proof. Stop rather than improvise when a STOP condition occurs. Update this plan's row in `plans/README.md` when done unless a reviewer owns the index.
>
> **Drift check (run first)**: `git diff --stat 878c937..HEAD -- packages/api/src/routers/admin/product.ts packages/api/src/queries/products/admin.ts packages/api/src/db/schema.ts apps/storev2/src/pages/products/[slug].astro packages/api/src/queries/products/store.ts`
> Expected: empty. If non-empty, compare every excerpt and named symbol to live code; semantic mismatch is a STOP condition.

## Status

- **Accepted audit ID**: B-07
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Suggested triage label**: `needs-info`
- **Planned at**: commit `878c937c3621ab35002e453da563f6ba551d6e86`, 2026-07-18

## Why this matters

Admin Product edits derive a new slug but do not append the prior value to the existing `oldSlugs` history. The live page currently canonicalizes ID-suffixed URLs by current slug, so owners must decide whether history is authoritative or retained for another consumer before changing lookup behavior.

## Current state

**Baseline source:** `packages/api/src/routers/admin/product.ts:266-271`

```ts
            const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
            const slug = productName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");
            const stockChange = await productQueries.admin.updateProduct(input.id, {
```

### Domain and repository rule

Preserve Product ID suffix URLs, cache purge, search rebuild, image handling, and current 301 canonicalization. Update current slug/history atomically.

### Existing-issue coordination

Coordinate with broad old-link QA in #149; do not claim duplication.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Baseline drift | `git diff --stat 878c937..HEAD -- packages/api/src/routers/admin/product.ts packages/api/src/queries/products/admin.ts packages/api/src/db/schema.ts apps/storev2/src/pages/products/[slug].astro packages/api/src/queries/products/store.ts` | empty, or excerpts revalidated before work |
| Type safety | `bun run check-types` | exit 0, no type errors |
| Build | `bun run build` | exit 0 |
| Changed files | `git diff --name-only` | only in-scope files plus `plans/README.md` status update |

Package-focused commands may replace root checks only when every changed workspace is covered. Real proofs below require an operator-provided local/staging environment and configured credentials/bindings; never print them.

## Scope

**In scope**
- approved history consumer/retention policy
- atomic append of prior slug only when changed
- end-to-end old URL proof

**Files/path families allowed**
- `packages/api/src/routers/admin/product.ts`
- `packages/api/src/queries/products/admin.ts`
- `packages/api/src/db/schema.ts`
- `apps/storev2/src/pages/products/[slug].astro`
- `packages/api/src/queries/products/store.ts`

**Out of scope**
- URL redesign
- Product ID suffix removal
- search/cache behavior
- unbounded history policy chosen silently

## Git workflow

- Branch: `audit/b-07-preserve-old-product-links-when-a-`.
- Commit small logical units using the repository's conventional style, for example `fix(storev2): ...` or `chore(api): ...`.
- Do not push or open a PR unless the operator explicitly instructs it.

## Steps

### Step 1: Owner decides whether `oldSlugs` is authoritative for on-demand redirects, plus retention/deduplication and concurrent-edit policy

Owner decides whether `oldSlugs` is authoritative for on-demand redirects, plus retention/deduplication and concurrent-edit policy.

**Verify**: `git grep -n -E 'oldSlugs|const slug =|updateProduct\(' -- packages/api/src apps/storev2/src/pages/products` → identifies schema history, admin update, and live canonical redirect consumer; record retention/authority policy.

### Step 2: Read current slug/history and atomically write current slug plus deduplicated prior slug

Read current slug/history and atomically write current slug plus deduplicated prior slug. Change lookup only if explicitly approved and necessary.

**Verify**: `bun run check-types && bun run lint` → both exit 0; diff shows current slug and deduplicated history are written within the existing Product update transaction.

### Step 3: Rename a disposable Product twice and request every prior/current URL

Rename a disposable Product twice and request every prior/current URL.

**Verify**: **Prerequisites/setup:** Staging admin/storefront and one disposable Product; approved history authority, retention, and concurrency policy.

**Bounded procedure:** Record URL A, rename to B, request A/B, rename to C, request A/B/C, and inspect authorized Product history.

**Machine-observable expected result:** Current C renders; each retained prior URL 301s to C; history contains each prior slug once and obeys retention.

**Cleanup:** Restore original name/slug/history or soft-delete disposable Product through existing workflow.

No unit or integration tests are requested. Do not use production Customer data, destructive operations, or remote writes as proof.

## Done criteria

- [ ] The path-scoped drift check was empty or every changed excerpt was revalidated.
- [ ] All ordered steps completed without crossing scope.
- [ ] `B-07` correction is observed through the real boundary described above.
- [ ] Applicable existing static/build commands exit 0.
- [ ] `git diff --name-only` contains only the allowed source paths and the plan status update.
- [ ] No secret, Customer data, destructive command output, or unsafe operational detail appears in commits/reports.

## STOP conditions

- Current code no longer matches the baseline excerpt or required behavior.
- History ownership/retention is unclear.
- Atomic read/write is unavailable.
- A caller depends on the update input contract or current ID-only behavior conflicts with the decision.
- A verification fails twice after one reasonable correction, or implementation requires an out-of-scope file.

## Maintenance notes

Review history growth and concurrent edits; never let a current slug be inserted as history.

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

`packages/api/src/routers/admin/product.ts:266-275` derives `slug` from Product fields and passes it directly to `updateProduct`. `ProductsTable.oldSlugs` already exists as redirect history.

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

**Verify**: Run the relevant inventory/read-only check and record the approved decision; expected: scope and owner are explicit.

### Step 2: Read current slug/history and atomically write current slug plus deduplicated prior slug

Read current slug/history and atomically write current slug plus deduplicated prior slug. Change lookup only if explicitly approved and necessary.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

### Step 3: Rename a disposable Product twice and request every prior/current URL

Rename a disposable Product twice and request every prior/current URL.

**Verify**: Run the focused static or real-system gate described below; expected: the stated behavior only.

## Real-system proof plan

Root `check-types`/`lint` exit 0. Current URL renders; each approved historical URL 301s to newest canonical URL; history contains each prior slug once.

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

# Admin audit remediation plan

> Superseded by `plans/admin-v1-solid-rewrite.md` (2026-08-11). The approved direction is the Solid rewrite in a parallel `apps/admin-v2`; this plan's React-first remediation is not being pursued. Kept as the record of the audit findings it was written from.

## Context

The admin audit (`apps/admin/admin-audit.html`) records 30 verified findings: 6 High, 17 Medium, and 7 Low. The immediate risks are data integrity and broken write workflows; the broader goal is to redesign the admin around the storefront v2's warm, accessible visual foundations without copying its retail-only patterns or mixing its Solid/Kobalte runtime into the React/Radix admin.

This plan will turn the audit into ordered, reviewable implementation batches. The working recommendation is to stabilize behavior and engineering gates before changing visual foundations, then redesign one route-sized vertical slice before rolling the system across all admin routes.

## Approach

1. **Stabilize correctness first:** address confirmed write/data/auth/date/search bugs and restore green type/lint gates.
2. **Normalize shared foundations:** fix semantic tokens, native interaction behavior, form feedback, motion, loading, query ownership, and performance architecture.
3. **Build an admin-native v2 layer:** reuse storefront v2's framework-neutral tokens and accessibility principles while retaining React/Radix components and operational density.
4. **Roll out by vertical slice:** establish and validate the redesigned shell plus one representative route, then migrate remaining routes in workflow-oriented batches.
5. **Track every audit item:** map all 30 findings to a batch, test, or explicit guardrail so none disappear during the redesign.

## Files to modify

Initial critical areas (exact list will be refined after scope confirmation and deeper inspection):

- `apps/admin/src/routes/_dash/index.tsx`
- `apps/admin/src/routes/_dash/products.index.tsx`
- `apps/admin/src/routes/_dash/customers.tsx`
- `apps/admin/src/routes/_dash/route.tsx`
- `apps/admin/src/routes/products.add.tsx` (move under `_dash`)
- `apps/admin/src/components/brands/brand-form.tsx`
- `apps/admin/src/components/categories/category-form.tsx`
- `apps/admin/src/components/customers/customer-form.tsx`
- `apps/admin/src/components/order/{order-form,order-card,orders-filters}.tsx`
- `apps/admin/src/components/product/{product-card,product-card-summary}.tsx`
- `apps/admin/src/components/purchase/{purchase-form,purchase-form.helpers,purchase-line-editor}.tsx`
- `apps/admin/src/components/ui/{button,input,form,pagination,sheet,card,badge}.tsx`
- `apps/admin/src/{index.css,lib/utils.ts,lib/constants.ts}`
- `apps/admin/src/routes/__root.tsx` and route modules needed for lazy loading
- `packages/api/src/routers/admin/{brands,product}.ts`
- `packages/api/src/queries/orders.ts`
- Focused tests colocated with affected utilities/components or in the repository's established test locations

## Reuse

- Storefront v2 semantic theme, typography, motion, and accessibility foundations from `apps/storev2/src/styles/global.css`.
- Storefront v2 touch-target and overlay behavior from `apps/storev2/src/components/ui/sheet.tsx`.
- Existing route-shaped loading states from `apps/admin/src/components/skeletons/admin-page-skeletons.tsx`.
- Existing admin React/Radix primitives in `apps/admin/src/components/ui/`; adapt these rather than importing Solid/Kobalte component implementations.
- Existing admin session guard and shell in `apps/admin/src/routes/_dash/route.tsx`.
- Existing API update resolver in `packages/api/src/routers/admin/brands.ts`.
- Existing focused purchase-list invalidation helper pattern in `apps/admin/src/components/purchase/invalidate-purchase-lists.ts` when defining centralized query invalidation.

## Steps

### Batch 1 — Data integrity and write workflows

- [ ] Replace fabricated dashboard history/trends with authoritative analytics or explicit unavailable states.
- [ ] Keep instant product results as summaries and hydrate full product data before editing.
- [ ] Route brand edits through `updateBrand`; distinguish create/update mutation states.
- [ ] Prevent shipping from silently discarding dirty order edits.
- [ ] Correct Ulaanbaatar calendar-date serialization without UTC date shifting.
- [ ] Move product creation beneath the authenticated dashboard route and shell.
- [ ] Close customer creation dialog on success.
- [ ] Apply product status filtering before search ranking/limit.
- [ ] Prevent duplicate brand/category submissions while mutations are pending.
- [ ] Align React Hook Form/Valibot generics across brand, category, customer, and order forms until type checking passes.

### Batch 2 — Accessibility and shared behavior

- [ ] Replace emulated links/buttons and mouse-only controls with native semantics; repair pagination behavior.
- [ ] Associate repeated purchase-line labels with stable, uniquely named controls.
- [ ] Standardize route anatomy with one localized H1, shared headers/toolbars, and shell-owned gutters.
- [ ] Make filters and analytics layouts safe at narrow widths and 200% text scaling.
- [ ] Enforce 44px touch targets and persistent/focus-visible actions.
- [ ] Add reduced-motion behavior and remove broad/nonessential animation.
- [ ] Normalize localized form errors, empty states, recovery actions, and field accessibility.
- [ ] Replace tiny uppercase typography with readable operational type scales.
- [ ] Define workflow-led mobile navigation explicitly rather than slicing desktop items.

### Batch 3 — State, scale, and delivery architecture

- [ ] Centralize product query keys and invalidation for lists, search, details, and selectors.
- [ ] Give purchase draft lines stable client IDs and cancel debounced work on cleanup.
- [ ] Move customer filtering/pagination server-side and eliminate unnecessary full-catalog fetching.
- [ ] Lazy-load heavy route modules and include devtools only in development; establish an initial bundle budget.

### Batch 4 — Admin v2 foundations and vertical slice

- [ ] Normalize Tailwind v4 semantic token vocabulary and add a representative CSS build smoke check.
- [ ] Map storefront v2 foundations into an admin-specific warm canvas/surface/ink/border/focus/status/chart theme.
- [ ] Keep React/Radix adapters; share only framework-neutral tokens and variant recipes.
- [ ] Standardize Onest typography, semantic status/chart roles, task-oriented loading, and admin-native primitives.
- [ ] Extract recurring admin compositions only after primitive normalization: `PageHeader`, `Toolbar`, `Panel`, `Metric`, `StatusBadge`, `EmptyState`, and `FormSection`.
- [ ] Redesign the agreed pilot route and shell, validate it, then migrate remaining routes in workflow batches.
- [ ] Explicitly exclude retail-only decoration, entrance staggering, hard shadows, oversized z-indexes, and other storefront debt called out in finding 30.

### Batch 5 — Full rollout and audit closure

- [ ] Apply the validated visual system across dashboard, orders, products, purchases, customers, brands, categories, analytics, and supporting forms/details.
- [ ] Re-run each confirmed reproduction and record closure evidence against all 30 audit findings.
- [ ] Update or replace the HTML audit artifact with remediation status and remaining risks.

## Verification

- Run `bun run --filter admin check-types`, `bun run --filter admin lint`, and `bun run --filter admin build` after each applicable batch.
- Add focused unit/integration coverage for date formatting, mutation selection, dirty-order shipping, product hydration, search filtering, query invalidation, and purchase-line identity.
- Exercise authenticated create/edit/ship/filter workflows with browser automation and realistic API data.
- Test keyboard and screen-reader semantics for navigation, cards, pagination, dialogs, forms, and status actions.
- Test at 320, 375, 390, 430, 768, and 1440px, plus 200% text scaling and reduced-motion preference.
- Verify no horizontal page scrolling, no inaccessible touch targets, no unsaved-data loss, and localized actionable error/empty states.
- Compare production build chunks and initial gzip size against the pre-change 443.13 kB baseline.
- Confirm every audit finding is either fixed with evidence or retained as an explicitly accepted risk.

## Open decisions

- Whether this Plannotator plan should authorize all remediation/redesign batches or only the stabilization phase first.
- Which route should be the first redesigned vertical slice.

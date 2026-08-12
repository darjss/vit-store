# Track 7 — admin-v2 Mobile Responsive + Critical Workflows QA

**Branch:** `feat/admin-v2-solid-rewrite`
**Stack under test:** local alchemy dev API (localhost:3006) + remote prod DB + local vite preview (localhost:5173), agent-browser on its own Chrome (never Helium)
**Viewports:** 393×852 (mobile), 1440×900 (desktop)
**Date:** 2026-08-12

## Summary

PASS with 5 bugs found and fixed, 3 open findings. All four routes verified end-to-end against real production data.

## Bugs found and fixed (all verified)

| # | Severity | Area | Bug | Fix |
|---|----------|------|-----|-----|
| 1 | P1 | app · orders | Order-detail next-action strip never re-renders after a status mutation — UI kept showing the old action ("Бэлтгэж эхлэх") until a manual reload, even though the DB had moved to `pending`. `const nextAction = primaryAction()` captured a non-reactive value at mount. | `nextAction = createMemo(() => primaryAction())` + `<Show when={nextAction()}>` (order-detail.tsx). Re-verified: action flips to "Илгээх" immediately after clicking, no reload. |
| 2 | P1 | api · analytics | `SUM(price * stock)` int4 overflow (Postgres 22003 int4mul) in both `getCurrentProductsValue` and `getAnalyticsData` → analytics snapshot 500s on real data. Also missing `deleted_at` filter in one spot. | `SUM(CAST(price AS bigint) * stock)` + `isNull(deletedAt)` in both queries (packages/api/src/queries/analytics.ts). |
| 3 | P1 | api · analytics | Analytics cache middleware ran before `.input()` validation, so `input` was `undefined` — all time ranges (daily/weekly/monthly) shared ONE KV cache entry; weekly/monthly served the daily payload. | Use `getRawInput()` in the cache key (packages/api/src/lib/trpc.ts). Verified all three ranges return distinct payloads (50,000₮ / 216,707₮ / 222,075₮). |
| 4 | P1 | app · ui | `@vit/ui` `Input` used Kobalte `TextFieldPrimitive.Input` without a `Root` → "useFormControlContext must be used within a FormControlContext.Provider" → whole products page crashed to error state. | Wrapped the bare control in its own `TextFieldPrimitive.Root` (packages/ui/src/components/input.tsx). |
| 5 | P2 | app · layout | Bare `grid` wrappers (implicit `grid-template-columns` track sized by the widest child's max-content) blew out to 1208–2461px at 393px on home/products/orders/analytics. | `grid-cols-1` (repeat(1, minmax(0,1fr))) on all 16 bare layout grids across the features (incl. low-stock-products.tsx, which was the original home-page blowout). |

## Verified (pass)

- **Home** — glance cards (26 Бэлтгэлд / 715 Бага үлдэгдэл / 41 7 хоногийн захиалга), next-action strip, work queue with real pending orders, recent orders, low-stock grid, quick actions, real-value metrics. Links navigate correctly.
- **Products** — list + infinite scroll, instant search (URL-driven), filters/sort in typed URL search params, create form (valibot validation, brand/category, image upload), inline stock editor (7→8, toast + DB persist), reload persistence, draft→active status via confirm, soft delete via confirm, detail page.
- **Orders** — status tabs, detail by alphanumeric code (never `Number()`), full legal walk created→pending→shipped→delivered with DB verification at each step, ship dialog (zone pick → TU), click-to-call + copy-address, delete with confirm.
- **Analytics** — three metrics, PostHog visitor trend chart renders (29 зочин max), range control switches `?range=` and values, freshness label, top brands, low-stock section.
- **Mobile 393×852** — home/orders/analytics `scrollWidth == 393`; products cannot be panned horizontally (scrollX stays 0 — clipped nowrap content inflates the scrollWidth metric only).
- **Desktop 1440** — `scrollWidth == 1440`, no overflow.
- **Keyboard** — Tab traversal works; focus lands on nav links with a visible 2px focus-visible ring.
- **Reduced motion** — `prefers-reduced-motion: reduce` matches; CSS motion block applies.
- **Console** — clean after fixes (no errors on home/orders/products/analytics loads).
- **Screenshots** — qa-reports/admin-v2/track7/screenshots/01-home-mobile.png … 05-home-desktop.png.

## Open findings (not blocking)

1. **200% text zoom at 393px** — home page pans ~34px horizontally (sw 427 vs 393): nowrap status badges / buttons at 2x text exceed the viewport. Minor; badges are intentionally nowrap.
2. **Product search only finds active products** — Upstash index filters by status and lags behind writes; newly created/activated products are not immediately searchable. By design + index lag, not an app bug.
3. **Category select in the product form** has no accessible name on its trigger (unnamed button).

## Notes

- Dev-only local tooling committed (stage-gated, inert on prod): per-request DB client (`runWithDevDb` — miniflare/workerd forbids cross-request socket reuse; no-op when `DIRECT_DB_URL` is unset), `/admin/dev-login` (404 without `DIRECT_DB_URL`), `compatibilityDate` + EmailSender `dev.remote` only under `stage === "dev"`.
- ZZTEST- cleanup: all test products/orders soft-deleted (prod DB clean of active test rows).

# Amerik Vitamin Production QA Audit

Date: 2026-06-23
Target: https://amerikvitamin.mn/
Method: Playwriter against deployed production site, desktop 1440x1000 and mobile 390x844.

## Executive Summary

The storefront has a strong visual identity, but it is not yet production-premium. The biggest conversion risks are not cosmetic: price inconsistency between PDP and cart/checkout, unreliable or slow-feeling route/search transitions, broken product image proxying, mobile search friction, and checkout layout that hides required fields below the first viewport.

Recommended order:

1. Fix price consistency and cart/checkout trust issues.
2. Fix broken product image proxying and invalid placeholders.
3. Rework search behavior, especially mobile open latency and Enter/full-results behavior.
4. Tighten checkout layout so fields and primary action are immediately visible.
5. Smooth route/search transitions with explicit loading states and cleaner preloads.
6. Polish mobile navigation labels, drawer behavior, and brand browsing truncation.

## Evidence Captured

- `/tmp/av-home-desktop.png`
- `/tmp/av-product-page.png`
- `/tmp/av-cart-dialog-desktop.png`
- `/tmp/av-checkout-desktop-actual.png`
- `/tmp/av-checkout-form-desktop.png`
- `/tmp/av-home-mobile.png`
- `/tmp/av-mobile-menu.png`
- `/tmp/av-search-magnesium-desktop.png`
- `/tmp/av-mobile-search-clean.png`

## P0 / Checkout And Trust

### Price mismatch between product page and cart/checkout

Observed:

- Product detail page displayed `125,000₮`.
- Cart drawer displayed the same product at `₮120,000`.
- Checkout order summary also used `₮120,000 x 3`.

Why it matters:

This is a direct trust killer. A shopper who notices a changing price may abandon rather than investigate.

Repro:

1. Open `https://amerikvitamin.mn/`.
2. Open the first Vitamin D3+K2 product.
3. Observe PDP price.
4. Add to cart.
5. Observe drawer and checkout summary price.

### Checkout hides required form fields below the first viewport

Observed:

- Checkout first viewport is dominated by order summary.
- Required delivery fields start lower on the page.
- Page copy says `ДООШ ГҮЙЛГЭЖ МЭДЭЭЛЛЭЭ ОРУУЛНА УУ`, effectively instructing users to scroll before they can act.

Why it matters:

Checkout should reduce cognitive load. Hiding the form and requiring scroll before progress makes the page feel broken or unfinished.

Repro:

1. Add any product to cart.
2. Click `ХУДАЛДАН АВАХ`.
3. Observe first checkout viewport.

## P1 / Search And Discovery

### Mobile search is slow and state-confusing

Observed:

- Desktop product-page search opened in about `240ms`.
- Desktop homepage search opened in about `3.5s`.
- Mobile bottom-nav search took about `3.9s` cleanly, and one run took about `7.1s`.
- Mobile search restored the previous `magnesium` query immediately.
- One screenshot did not visually show the search overlay even though the accessibility tree reported the dialog, suggesting a render/animation/capture race.

Why it matters:

If analytics show search is barely used, this matches the user experience: search is not consistently fast or clearly available, especially on mobile.

Repro:

1. Set viewport to 390x844.
2. Open homepage.
3. Tap bottom-nav `Хайх`.
4. Time until the search dialog is visible and interactive.

### Enter key affordance does not perform search navigation

Observed:

- Search dialog shows `Enter хайх`.
- Typing `magnesium` and pressing Enter kept the user on `/`.
- Inline results remained in the overlay.

Why it matters:

The UI promises a keyboard action that does not visibly happen. Users expecting a full search results page may think search is broken.

Repro:

1. Open search.
2. Type `magnesium`.
3. Press Enter.
4. Observe URL and UI state.

### Search result cards emphasize add-to-cart over product exploration

Observed:

- Search results show long product titles and a strong `САГСЛАХ` action.
- Product detail navigation exists but is less visually emphasized than immediate add-to-cart.

Why it matters:

For supplements, users often need to inspect dosage, ingredients, brand, count, and suitability. Search should help compare and learn, not push only immediate carting.

## P1 / Assets And Product Images

### Product image proxy returns 403 for at least one Amazon image

Observed bad response:

`https://cdn.darjs.dev/cdn-cgi/image/width=360,quality=75,fit=contain,format=auto/https://m.media-amazon.com/images/I/81N6UICgNKL._AC_SL1500_.jpg`

Status: `403`, resource type: image.

Why it matters:

Broken product images damage perceived legitimacy immediately.

Repro:

1. Browse production pages with network logging.
2. Inspect image responses with status >= 400.

### Invalid placeholder image URL returns HTML

Observed:

- `https://www.placeholder.com/logo.png` returns `200`, but `content-type: text/html`.

Why it matters:

An image element receiving HTML is a broken image even if HTTP says 200.

### Homepage DOM reports many unloaded/broken image elements

Observed:

- Desktop home: `107` image elements with `complete=false` or natural dimensions `0`.
- Mobile home: same count.
- Many are brand logos; direct fetch of several CDN brand logos returned 200 image responses, so this may include lazy/offscreen images. Still, invalid placeholders and confirmed 403s show real asset hygiene problems.

## P1 / Navigation Smoothness

### Product-card navigation feels delayed/racy

Observed:

- Clicking the first homepage product card initially reported staying on `/` after about `3s`.
- The route eventually reached the product page, but the transition did not produce a clean immediate completion signal.

Why it matters:

This feels like a dead click or lag. If no loading state appears, users may click again, add unwanted quantities, or abandon.

Repro:

1. Open homepage.
2. Click first product card.
3. Watch URL, visual feedback, and cart count.

### Server-island preload warnings repeat heavily

Observed repeated warnings:

- `_server-islands/SidebarUserSection` preloaded but not used soon after load.
- `_server-islands/UserProfile` preloaded but not used soon after load.

Why it matters:

This may contribute to wasted work, noisy console, and inconsistent route readiness.

## P2 / Mobile UI Polish

### Cart label typo: `Carc`

Observed:

- Mobile bottom nav displays `Carc`.
- Mobile menu tile also displays `Carc`.

Expected:

- Mongolian `Сагс`, or a consistent English `Cart`, but not `Carc`.

### Bottom nav remains visually active under menu drawer

Observed:

- With mobile menu drawer open, bottom nav remains visible.
- Tapping bottom `Хайх` while menu is open highlighted the search tab behind the drawer instead of opening search.

Why it matters:

Modal/drawer layers should make unavailable background controls inert and visually inactive.

### Mobile menu brand tiles truncate heavily

Observed:

- Brand names are shortened to labels like `MICRO I...`, `NATURE...`, `NUTRIC...`.

Why it matters:

Brand browsing is a key trust/discovery path for supplements. Over-truncated tiles reduce scan confidence.

## P2 / Visual Polish

### Product page pushes purchase controls too low

Observed:

- Desktop PDP title is very large.
- Price/add-to-cart area starts low in the viewport.

Why it matters:

The page is visually memorable, but conversion controls should be visible earlier.

### Homepage first viewport is visually heavy

Observed:

- Hero and product grid compete immediately.
- Brand marquee cuts across the lower viewport.
- Desktop top nav is icon-only.

Why it matters:

The store feels distinctive, but less calm and guided than premium ecommerce. It should better direct shoppers toward browse/search/cart.

## Accessibility / Console

### Search dialog aria-hidden focus warning

Observed warning:

Focused element remains inside an ancestor with `aria-hidden` when search opens.

Why it matters:

This can break assistive technology behavior and usually indicates modal focus management is wrong.

### Analytics scripts blocked by client

Observed:

- Cloudflare Insights blocked.
- PostHog recorder/dead-click scripts blocked.

Why it matters:

Expected for ad/privacy blockers, but analytics should degrade cleanly. Since conversion rate is a concern, server-side or first-party event backups may be worth considering later.

## Recommended Implementation Slices

1. Cart/checkout price consistency
   - Ensure PDP, cart drawer, and checkout all read the same price source.
   - Add regression test for product price consistency.

2. Product image hardening
   - Detect and remove invalid placeholder image URLs.
   - Stop using proxied Amazon URLs that return 403, or cache them into owned CDN storage.
   - Add image fallback that looks intentional, not broken.

3. Search behavior cleanup
   - Make mobile search open under 500ms.
   - Make Enter either navigate to a full results page or remove the `Enter хайх` promise.
   - Add explicit empty/loading/results states.
   - Consider giving product-detail navigation equal weight to add-to-cart.

4. Checkout layout redesign
   - Put delivery form and order summary in a layout where both are visible quickly.
   - Remove “scroll down” instruction by making the page self-evident.
   - Keep required fields and primary continue action visible without excessive scroll.

5. Navigation and transition polish
   - Add route pending state for product-card navigation.
   - Avoid stale URL/racy transition feel.
   - Review server-island preload usage.

6. Mobile nav polish
   - Fix `Carc` label.
   - Make bottom nav inert under menu/search drawers.
   - Improve brand tile labels in the menu.

## Suggested QA Gates Before Calling It Production-Premium

- No product image responses with 4xx on homepage, product listing, search, PDP, cart, or checkout.
- PDP/cart/checkout price parity verified for sampled products.
- Mobile search opens in under 500ms on a warm page.
- Enter behavior in search matches visible UI copy.
- Checkout first viewport shows actionable form content.
- No modal focus/aria-hidden warnings during search/menu/cart flows.
- Mobile bottom nav labels are localized and typo-free.
- Full purchase path can be completed without ambiguous dead-click moments.

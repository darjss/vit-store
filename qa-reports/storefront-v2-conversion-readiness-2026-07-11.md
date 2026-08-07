# Storefront V2 conversion-readiness report

**Surface:** `https://staging.amerikvitamin.mn`  
**Compared with:** `https://amerikvitamin.mn`  
**Reviewed:** 2026-07-11  
**Primary viewport:** mobile, approximately 375–430 CSS px, including the manually selected iPhone 14 Pro Max preset  
**Scope:** homepage, catalogue, search, category discovery, product detail, cart, and checkout through the payment boundary. No order or payment was submitted.

## Executive summary

V2 has a warmer, more approachable visual direction than production, but it is not ready to replace production. Its strongest ideas, category-led browsing, softer product presentation, and clearer delivery messaging, are currently outweighed by broken discovery and checkout dependencies.

The release recommendation is **do not promote staging to production yet**. Product search fails, the required delivery-zone field is empty, the main catalogue exposes only 12 of 319 advertised products, and the mobile homepage merchandising cards are visibly clipped. These are conversion blockers, not polish backlog.

After the blockers are fixed, V2 still needs a focused mobile merchandising and copy pass. Product cards spend scarce space repeating brand names while hiding the information shoppers use to compare products. Several trust messages are generic, duplicated, or unsupported by nearby detail. Checkout wording also implies payment earlier than the flow actually charges or instructs the customer.

## Conversion-readiness score

| Area | Score | Assessment |
| --- | ---: | --- |
| Mobile layout | 4/10 | Core navigation is usable, but the homepage carousel and add controls are clipped at the primary viewport. |
| Product discovery | 2/10 | Search fails, filters show zero results, and most of the advertised catalogue is unreachable. |
| Product comprehension | 5/10 | Price and imagery are prominent, but long English titles and repetitive brand text hide useful comparison data. |
| Trust and reassurance | 5/10 | Authenticity and delivery are visible, but generic labels and unexplained certification marks weaken credibility. |
| Cart and checkout | 3/10 | The cart summary is clear, but staging cannot populate the required delivery zone, blocking progression. |
| Copy quality | 5/10 | Generally understandable Mongolian, with one visible grammar error, vague CTAs, duplicated claims, and inconsistent specificity. |
| Release readiness | 3/10 | V2 should remain in staging until the P0 and P1 findings are fixed and retested. |

## Verified blockers

### P0: Required checkout delivery zones are empty

On staging, `Хаягийн бүс` contains only its placeholder. The field is required, so a shopper cannot proceed to payment. Production provides a full list of zones for the same journey.

**Conversion impact:** complete checkout failure for delivery orders.

**Issue:** [#157](https://github.com/darjss/vit-store/issues/157)

### P0: Product search returns an error

Searching for `magnesium` produces `Уучлаарай, алдаа гарлаа. Дахин оролдоно уу.` instead of results.

**Conversion impact:** high-intent shoppers cannot retrieve known products or compare alternatives.

**Issue:** [#160](https://github.com/darjss/vit-store/issues/160)

### P1: Main catalogue exposes only 12 of 319 products

The catalogue advertises 319 products but reaches the footer after 12 cards. There is no visible pagination or load-more path.

**Conversion impact:** most inventory cannot be discovered through general browsing.

**Issue:** [#162](https://github.com/darjss/vit-store/issues/162)

### P1: Homepage product cards break at mobile width

The top merchandising carousel cards overflow internally. In the current iPhone 14 Pro Max preset, the measured card is approximately 140 CSS px wide while its circular add-to-cart control extends approximately 16 CSS px beyond the card's right edge. The next card intrudes at the viewport edge, product names are aggressively truncated, and the add control is visibly clipped. The larger product cards later on the homepage contain their buttons correctly, so this finding is specific to the top compact carousel.

**Conversion impact:** the highest-value merchandising area looks unfinished and its primary action is harder to understand and tap confidently.

**Issue:** [#159](https://github.com/darjss/vit-store/issues/159)

### P1: Filters preview zero products before filtering

The catalogue says `319 бүтээгдэхүүн`, while the untouched filter sheet says `Харах 0`.

**Conversion impact:** shoppers are discouraged from applying filters and cannot trust the expected result count.

**Issue:** [#161](https://github.com/darjss/vit-store/issues/161)

## Mobile UI and merchandising findings

### High priority

1. **The top compact product-card layout does not contain its action.** The add button extends about 16 CSS px beyond a roughly 140 CSS px card at the manually selected iPhone 14 Pro Max preset. The carousel may show a deliberate next-card peek, but the current card and its CTA must remain fully contained.

2. **Product cards hide the differentiating information.** The brand label says `MICRO INGREDIENTS`, then the title begins `Micro Ingredients, ...`. At two lines, the useful part, dose, formulation, count, or audience, is often truncated.

   Recommended content hierarchy:

   - Eyebrow: `Micro Ingredients`
   - Primary title: `D3 + K2, 2,000 IU / 50 мкг`
   - Secondary metadata: `300 зөөлөн капсул`
   - Price and add action

3. **English source titles dominate a Mongolian shopping task.** Preserve the full imported title on the product page for accuracy, but use a localized, benefit-neutral short name on cards. The technical title can sit below or in details.

4. **The add-to-cart icon is visually louder than the product information.** The yellow stamped circle is the strongest object on the card, yet its clipped position makes it feel accidental. Bring it fully inside the card and keep one unambiguous buy action per card.

5. **The persistent bottom navigation competes with purchase controls.** On product detail, the fixed bottom navigation and sticky add-to-cart area occupy the same thumb zone. Ensure only the purchase action owns the primary yellow voice and that navigation never obscures it.

### Medium priority

6. **The homepage repeats authenticity without adding proof.** `100% жинхэнэ`, `АНУ-аас албан ёсоор ирдэг жинхэнэ бүтээгдэхүүн`, and the footer certification row repeat the claim. Replace one repetition with concrete proof: importer name, traceability, sealed packaging, or invoice/lot support.

7. **Homepage category counts are inconsistent with destination pages.** `Магни ба Эрдэс` shows 32 products on the homepage and 43 on the category page. If one count means in-stock products, label it explicitly.

   **Issue:** [#163](https://github.com/darjss/vit-store/issues/163)

8. **Horizontal carousels lack a clear affordance.** A partial next card can suggest scrolling, but in the current layout it reads as clipping. Add consistent edge padding, snapping, and a small count or progress treatment only when it helps orientation.

9. **The homepage is long and repetitive on mobile.** Hero products, featured products, new arrivals, category tiles, trust rows, brands, a second CTA, and a large footer create a long path before completion. Prioritize search, need-based categories, best sellers, and one trust block. Defer secondary brand lists and repeated calls to action.

10. **Footer certification acronyms lack context.** `GMP`, `FDA`, `NSF`, `USP`, `Non-GMO`, and `USDA` appear as broad trust marks without explaining whether they apply to the store, every product, or selected manufacturers. This can look like generic badge decoration. Qualify the scope or move certifications to applicable products.

11. **Empty heading elements are present on product detail.** The live product page exposes empty `h3`/`h4` elements around detail content. Even when visually harmless, they weaken structure for assistive technology and automated product understanding.

## Product-detail findings

1. **Availability is duplicated.** `Бэлэн байна` appears twice consecutively below the price.

   **Issue:** [#158](https://github.com/darjss/vit-store/issues/158)

2. **The recommendation heading contains a grammar error.** `Таньд таалагдаж магадгүй` should be `Танд таалагдаж магадгүй`.

3. **The trust row is generic.** `Баталгаатай`, `Хурдан хүргэлт`, `Найдвартай`, and `Буцаалт` are labels rather than evidence. `Баталгаатай` and `Найдвартай` overlap semantically.

   Recommended replacements:

   - `АНУ-аас албан ёсоор импортолсон`
   - `УБ-д өнөөдөр эсвэл маргааш`
   - `Битүүмжлэлтэй, эх бараа`
   - `Буцаалтын нөхцөл харах`

4. **Dose presentation can be misread.** `1,000mg` is shown as a prominent isolated fact without immediately stating whether it is per capsule, serving, compound weight, or elemental magnesium. Keep the source claim, but label its basis next to the number.

5. **Recommendations are weakly explained.** `Таны сонголтод тулгуурлан санал болгож байна` sounds personalized, but the list appears to be category/brand related and includes broad alternatives. Use `Ижил төрлийн бүтээгдэхүүн` unless genuine personalization exists.

6. **The medical disclaimer is detached from the actionable product facts.** Keep the disclaimer, but ensure usage and ingredients are understandable before it. A disclaimer should not substitute for dose clarity.

## Cart and checkout findings

1. **The cart CTA is broader than the next step.** `Худалдан авах` leads to delivery information rather than completing a purchase. `Захиалга үргэлжлүүлэх` sets the correct expectation.

2. **The checkout step-one CTA sounds like an immediate charge.** `Төлбөр төлөх →` appears while the user is still entering delivery details, and supporting copy says the next step is the payment page.

   Recommended CTA: `Төлбөрийн мэдээлэл рүү`  
   Recommended support: `Дараагийн алхамд шилжүүлгийн мэдээлэл харагдана.`

3. **Delivery timing changes specificity across the journey.** The homepage promises same-day delivery before 10:30, product detail says today or tomorrow, and checkout says tomorrow after 12:00. The rules may be valid, but the UI should consistently explain the cutoff and current expected date.

4. **The checkout button remains visually active before required data exists.** Validation appears after submission, which is acceptable, but the empty delivery-zone dependency makes the active payment CTA feel broken. Once data loading is reliable, provide an explicit loading/error state for the zone field.

5. **The order summary is collapsed into a terse count and total.** Keep the compact mobile layout, but make the product summary easy to verify before payment with product name, quantity, delivery fee, and final total visible without ambiguity.

## Copy rewrite table

| Current copy | Recommended copy | Why |
| --- | --- | --- |
| `Таньд таалагдаж магадгүй` | `Танд таалагдаж магадгүй` | Correct grammar. |
| `Таны сонголтод тулгуурлан санал болгож байна` | `Ижил төрлийн бүтээгдэхүүн` | Avoid unsupported personalization. |
| `Баталгаатай` | `АНУ-аас албан ёсоор импортолсон` | Replace vague trust language with a verifiable fact. |
| `Найдвартай` | Remove or replace with evidence | It duplicates `Баталгаатай` without explaining anything. |
| `Худалдан авах` | `Захиалга үргэлжлүүлэх` | Accurately describes cart-to-checkout progression. |
| `Төлбөр төлөх →` | `Төлбөрийн мэдээлэл рүү` | Reduces anxiety and matches the actual next step. |
| `Дараагийн алхамд төлбөрийн хуудас руу шилжинэ` | `Дараагийн алхамд шилжүүлгийн мэдээлэл харагдана.` | More concrete for bank-transfer payment. |
| `Харах 0` | `319 бүтээгдэхүүн харах` when untouched | Restore confidence in filter results. |
| Long imported product title on cards | Localized short name + dose/count metadata | Improves scanning and comparison without discarding source accuracy. |
| `100% жинхэнэ` repeated across the page | One authenticity claim plus proof | Trust grows from evidence, not repetition. |

## What V2 does better than production

- The warmer palette and softer surfaces feel more approachable than the production storefront.
- Need-based category tiles are a better discovery entry point than a brand-heavy wall.
- Price, delivery, and availability are positioned close to purchase controls.
- Sentence-case typography is calmer and more readable than production's all-uppercase presentation.
- The checkout flow asks for relatively little information, which is appropriate for mobile conversion.

These gains are directional. They do not compensate for broken search, incomplete catalogue access, or blocked checkout.

## Recommended release sequence

1. Fix the staging data boundary that affects search, inventory, filter counts, and delivery zones.
2. Make every advertised product reachable through the main catalogue.
3. Repair the homepage card geometry at 320, 375, 390, and 430 CSS px.
4. Shorten/localize product-card names and expose dose, form, and count as structured metadata.
5. Replace vague or duplicated trust copy with specific evidence.
6. Correct product-detail and checkout copy.
7. Retest the full mobile journey from homepage search and category browsing through checkout, stopping before order/payment submission.

## Open GitHub issues

- [#157: Staging V2 storefront cannot retrieve discovery or delivery data](https://github.com/darjss/vit-store/issues/157)
- [#158: Staging V2 product detail shows availability twice](https://github.com/darjss/vit-store/issues/158)
- [#159: Staging V2 homepage featured-product cards overflow on mobile](https://github.com/darjss/vit-store/issues/159)
- [#160: Staging V2 product search returns an error instead of matching products](https://github.com/darjss/vit-store/issues/160)
- [#161: Staging V2 product filters report zero results before filtering](https://github.com/darjss/vit-store/issues/161)
- [#162: Staging V2 catalogue exposes only 12 of the advertised 319 products](https://github.com/darjss/vit-store/issues/162)
- [#163: Staging V2 homepage category counts disagree with category pages](https://github.com/darjss/vit-store/issues/163)

## Verification notes

- Browser: T3 Code collaborative preview.
- Staging and production were tested separately at mobile width.
- Search was tested with `magnesium`.
- A product was added to cart to inspect checkout.
- The empty checkout form was submitted once to verify client validation only.
- No valid customer data was entered.
- No order was created, no payment was attempted, and no database access was used.

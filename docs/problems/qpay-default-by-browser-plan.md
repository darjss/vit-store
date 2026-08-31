# Default Payment Method by Browser

Status: plan; PR #307 must not merge in its current form

## Problem

Every new storefront Payment starts as `transfer`, so every customer first sees
manual bank transfer. QPay offers a shorter path for most customers, but bank
app links often fail inside Facebook on iOS. The default should therefore be:

- Facebook iOS: transfer
- Every other browser: QPay

The first PR tried to choose the default in the payment component on every
page load. That is unsafe. If a customer had already chosen transfer, reopening
the page selected QPay, created an invoice, and changed the saved provider to
`qpay`. The transfer reconciler can then stop tracking a transfer the customer
already made.

The default is a one-time choice for a new Payment. It must not replace a saved
customer choice on later visits.

## Production Data

From `2026-08-30 05:26 UTC` through the investigation on `2026-08-31`:

| Result after Order creation | Orders | Share | Value |
| --- | ---: | ---: | ---: |
| Paid | 2 | 40% | 722,000 MNT |
| Unpaid | 3 | 60% | 653,000 MNT |
| Total | 5 | 100% | 1,375,000 MNT |

All five Payments started on transfer. Two unpaid customers did not select a
QPay bank link. One Facebook iOS customer interacted with a bank option, but
the available events cannot prove whether a native bank app opened. No
checkout or payment API error explains the three unpaid results.

The sample is too small to estimate the lift from a new default. It does show
that transfer-first friction exists after customers have already placed an
Order.

The Facebook iOS exception has a larger production sample. From `2026-08-25`
through `2026-08-30`, 19 Facebook bank-link clicks produced 6 observed app
handoffs, 10 observed no-handoffs, and 3 clicks with no recorded outcome. See
`docs/problems/khan-bank-facebook-ios-handoff.md` for the limits of that
measurement.

## Industry Comparison

Public checkout benchmarks vary by event definition and store mix:

| Source | Completion | Sample and limit |
| --- | ---: | --- |
| Littledata, all Shopify | 45% average | 2,800 ecommerce sites benchmarked in 2023; the public page does not publish the exact formula or Shopify sample size |
| Littledata, mobile | 44% average | Same sample and method limit |
| Littledata, desktop | 49% average | Same sample and method limit |
| Top Growth Marketing, DTC Shopify | 65.1% median | 423,978 checkout starts from 16 agency clients, July 2025 through June 2026; exact `orders / checkouts started` denominator but a small, selected store panel |
| Zuko, purchase forms | 54.4% | 20,179,282 purchase-form sessions; completion means form submission, not confirmed payment |

Our observed 40% post-Order payment rate is 5 percentage points below the 45%
Littledata average and 25.1 points below the 65.1% DTC Shopify median. These are
not equal comparisons: both industry funnels start before ours, while our
cohort has already submitted checkout and created an Order. Our later-stage
payment rate should normally be higher, but five Orders cannot establish a
stable baseline. The figures show cause to improve the payment path, not a
reliable estimate of how much QPay-first will improve it.

Baymard reports 70.22% average cart abandonment across 50 studies. That is not
the target for this change because cart creation happens earlier than both
checkout and Order creation. It is included only to prevent comparing our 60%
post-Order unpaid share with a cart-abandonment number that uses a different
denominator.

Sources:

- [Littledata: average website performance](https://www.littledata.io/average-website-performance)
- [Top Growth Marketing: 2026 DTC checkout benchmark](https://topgrowthmarketing.com/dtc-ecommerce-benchmarks/checkout-abandonment-rate/)
- [Zuko: form-purpose benchmark](https://www.zuko.io/benchmarking/form-type-benchmarking)
- [Baymard: cart abandonment rate statistics](https://baymard.com/lists/cart-abandonment-rate)

## Invariant

Once a Payment exists, its saved provider is the source of truth. A page load
must never change it just because the user agent changed or was detected
differently.

## Simple Design

Choose the initial provider once, when `addOrder` inserts the Payment:

1. Read the request `User-Agent` header.
2. If it identifies Facebook on iOS, insert `provider: "transfer"`.
3. Otherwise, insert `provider: "qpay"`.
4. Keep `PaymentOptions` selecting its initial tab from `props.provider`.

No client-side default override is needed. Existing actions already save later
choices:

- Selecting transfer changes the Payment provider to `transfer`.
- Creating a QPay invoice changes the Payment provider to `qpay`.
- Revisiting the page restores that saved provider.

Keep the user-agent check next to new Payment creation. It has one policy and
one call site, so a new browser service or shared abstraction would add more
code than it removes. Match the Facebook markers already used by storefront
analytics and require an iOS device marker.

If the `User-Agent` header is missing, use QPay. Normal browser requests send
the header, and the requested policy defines every non-Facebook-iOS request as
QPay-first.

## Files

- `packages/api/src/routers/store/order.ts`: choose the provider before the
  Payment insert.
- `apps/storev2/src/components/payment/payment-options.tsx`: restore the prior
  persisted-provider initializer and remove the client user-agent override from
  PR #307.

## Non-goals

- Pre-create a QPay invoice during Order creation
- Change QPay deeplink or recovery behavior
- Add a discount or expose the QPay merchant fee to customers
- Detect every social in-app browser
- Change the provider on an existing Payment
- Add a browser-routing framework or new shared package

## Release Plan

1. Replace PR #307's client-side override with the server-side initial provider.
2. Confirm the PR diff changes only Payment creation and restores the old tab
   initializer.
3. Merge and deploy through the normal storefront path.
4. Check new production Payments by browser group and confirm their initial
   providers match the policy.
5. Watch the first 30 to 50 new Orders before judging conversion impact.

## Success Measures

Primary measure:

- Paid Payments divided by new Orders, measured for 30 to 50 Orders after
  release and compared with the pre-release cohort using the same denominator.

Safety measures:

- New Facebook iOS Payments start on transfer.
- New non-Facebook-iOS Payments start on QPay.
- A customer who selects transfer still sees transfer after refresh or revisit.
- A transfer Payment never changes to QPay from page load alone.
- QPay invoice and payment error rates do not rise.

Report browser groups separately. A single combined conversion rate can hide a
gain outside Facebook iOS and a loss inside it.

## Merge Gate

Do not merge PR #307 while its component initializer ignores
`props.provider`. The PR is safe only after the provider is chosen at Payment
creation and the page once again restores the saved provider.

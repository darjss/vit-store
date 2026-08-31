# PostHog Payment Attribution Plan

Status: plan

## Problem

PostHog cannot currently answer which traffic sources produce paid Orders or
revenue. Browser traffic and `checkout_started` events have automatic session
attribution, but server commerce events do not share that browser identity or
session.

The production database is the financial source of truth. As of `2026-08-31`
UTC it contains 135 successful Payments across 135 Orders and 31,979,100 MNT in
paid revenue. PostHog contains only 63 distinct `payment_confirmed` payment
numbers and 13,377,000 MNT in raw tracked revenue. The two systems also cover
different historical windows, so PostHog must not be used for lifetime revenue.

The current event design has four faults:

- `addOrder` sends no PostHog distinct ID or session ID to the API.
- Server events use a phone hash as `distinctId` and omit `$session_id`, so they
  do not join the browser session or its first-touch source.
- `order_created`, `order_placed`, and `payment_confirmed` all carry `$revenue`,
  even though only a confirmed Payment is revenue. A broad PostHog revenue query
  can count the same Order more than once or count unpaid Orders.
- Local development traffic reaches the production PostHog project. It already
  appears in source reports as `[::1]:4321`.

## Goal

PostHog should answer the product question:

> For each first-touch traffic source, how many visitors start checkout, create
> an Order, complete payment, and how much confirmed revenue do they produce?

It should also show which payment method was presented first, what the customer
explicitly selected, and which confirmation path completed payment.

The database should continue answering the finance question:

> How many Payments succeeded and how much paid revenue did the store record?

## Invariants

- `payment.status = 'success'` and `payment.amount` are the revenue source of
  truth.
- Only `payment_confirmed` carries `$revenue` in PostHog.
- One successful Payment produces one `payment_confirmed` event.
- A page load or later payment callback must not invent new attribution.
- Webhook, transfer reconciliation, admin, and browser confirmation use the
  same stored checkout attribution.
- Production reports contain production events only.
- Every commerce event uses the same Order and Payment identifiers.

## Simple Design

### 1. Keep production data clean

Do not initialize the production PostHog project during local development or
tests. Register `environment: "production"` on production browser events and
set the same property on server captures.

If staging analytics becomes necessary, use a separate PostHog project rather
than mixing it into production and relying on every query to filter it out.

### 2. Capture browser context at Order submission

Read these values from the existing PostHog browser SDK immediately before the
`addOrder` request:

- `posthog.get_distinct_id()`
- `posthog.get_session_id()`

Add one optional `analytics` object to the `addOrder` input with `distinctId`
and `sessionId`. Validate both as bounded strings. Analytics context must never
block checkout.

Do not send UTM fields separately. The PostHog session already owns initial
referrer, channel, and UTM attribution.

### 3. Persist context on the Order

Add two nullable columns to `ecom_vit_order`:

- `posthog_distinct_id`
- `posthog_session_id`

The Order owns first-touch checkout attribution. Persisting it once also makes
it available when payment completes later through a webhook, transfer
reconciliation, Messenger, or an admin action.

Do not add a generic analytics JSON column or a browser-attribution service.
There are only two required values.

### 4. Use the stored context for server events

Pass the Order's stored context to `order_created` and the common payment
confirmation boundary. Server captures should use:

- stored `distinctId` when present;
- the existing phone hash only when the Order did not originate in a browser;
- `properties.$session_id` when present.

Include `order_number` and `payment_number` on every commerce event where those
values exist. Do not create a separate analytics-only checkout identifier.

Keep browser `identify` behavior for person merging, but do not depend on a
late, non-awaited `identify` call to link the server event.

### 5. Make one event canonical for revenue

Keep two commerce events:

- `order_created`: Order intent, `order_value`, no `$revenue`.
- `payment_confirmed`: successful Payment, `$revenue`, currency, provider,
  Order number, Payment number, products, and `confirmation_source`.

Remove the duplicate `order_placed` capture from the payment confirmation
boundary. Its name implies Order creation, but it currently fires at payment
confirmation and duplicates the same value.

Set `$insert_id` to `payment_confirmed:<paymentNumber>` so PostHog deduplicates
retries. The database confirmation boundary remains the main duplicate guard.

Use these bounded `confirmation_source` values:

- `qpay_checkout`
- `qpay_webhook`
- `auto_reconciliation`
- `admin`
- `messenger`

### 6. Track payment presentation and explicit choice

Add only two browser events:

| Event | When it fires | Required properties |
| --- | --- | --- |
| `payment_method_viewed` | Once when a Payment page is shown | `payment_number`, `default_provider`, `default_reason`, `is_revisit`, `in_app_browser` |
| `payment_method_selected` | Only when the customer explicitly changes method | `payment_number`, `provider`, `previous_provider`, `in_app_browser` |

Use `facebook_ios` and `standard` as the only `default_reason` values. Do not
emit `payment_method_selected` for the initial render. That keeps exposure and
customer intent separate.

The events inherit browser session, source, and device properties. Add
`in_app_browser` with the existing detector because PostHog does not derive that
custom classification. Do not copy the other automatic browser properties into
the payload.

### 7. Save one funnel contract

Use these fixed definitions for traffic comparisons:

1. Visitor: first-touch web visitor.
2. Checkout: unique visitor with `checkout_started`.
3. Order: unique `order_number` with `order_created`.
4. Paid: unique `payment_number` with `payment_confirmed`.
5. Revenue: one `payment_confirmed.$revenue` per unique `payment_number`.

Break down the same funnel by first-touch channel, initial referring domain,
default provider, selected provider, and confirmation source. Do not change the
denominator between Google and Facebook reports.

### 8. Reconcile database and PostHog

Use `scripts/revenue-report.ts` for the database total. Add a matching PostHog
SQL check after the new event shape ships:

- unique `payment_number` count;
- sum of one `$revenue` value per `payment_number`;
- comparison from the deployment timestamp forward.

Do not rewrite old PostHog history. Use the database for historical revenue and
declare the deployment timestamp as the start of reliable source-attributed
revenue.

## Files

- `apps/storev2/env.d.ts`: type `get_session_id`.
- `apps/storev2/src/components/posthog.astro`: prevent local production capture
  and register the production environment.
- `apps/storev2/src/lib/analytics.ts`: expose the two-value browser context and
  the two payment-method events.
- `apps/storev2/src/components/checkout/checkout-form.tsx`: send context with
  `addOrder`.
- `apps/storev2/src/components/payment/payment-options.tsx`: capture payment
  presentation and explicit selection.
- `packages/shared/src/schema.ts`: validate optional analytics context.
- `packages/api/src/db/schema.ts`: persist context on Orders.
- `packages/api/src/db/migrations/`: add the two nullable columns.
- `packages/api/src/routers/store/order.ts`: save and capture the context.
- `packages/api/src/lib/integrations/posthog/capture.ts`: accept context, set
  `$session_id`, `$insert_id`, environment, and confirmation source; remove
  revenue from `order_created`.
- `packages/api/src/lib/payments/transfer-confirmation.ts`: emit only the
  canonical payment event with stored attribution.

## Non-goals

- Make PostHog the financial ledger
- Build an attribution model outside PostHog
- Add an event outbox
- Add UTM columns to Orders
- Backfill or rewrite old PostHog events
- Track native bank-app screens that the storefront cannot observe
- Add generic click tracking or copy automatic browser properties into every
  custom event

## Delivery

1. Stop local and test events from entering the production PostHog project.
2. Add nullable Order attribution columns and pass browser context through
   `addOrder`.
3. Update server captures to use the stored distinct ID and session ID.
4. Remove duplicate revenue properties, add the payment `$insert_id`, and add
   confirmation source.
5. Add the two payment-method events.
6. Deploy and record the exact UTC cutoff.
7. Save the fixed funnel and compare database and PostHog totals daily for seven
   days.

## Success Measures

From the deployment cutoff forward:

- Database successful Payment count equals unique PostHog
  `payment_confirmed.payment_number` count.
- Database successful Payment amount equals deduplicated PostHog `$revenue`.
- `payment_confirmed` has a first-touch channel for browser-created Orders.
- Google and Facebook can be compared through visitor, checkout, Order, paid
  Payment, conversion rate, and revenue using one attribution rule.
- No unpaid Order contributes PostHog revenue.
- Production reports contain no localhost or staging traffic.
- QPay-default analysis distinguishes method exposure from explicit selection.
- Every confirmed Payment has one of the five known confirmation sources.

## Current Revenue Baseline

Database query: successful, non-deleted Payments grouped by `updated_at` in
UTC.

| Month | Paid Payments | Revenue | AOV | QPay revenue share |
| --- | ---: | ---: | ---: | ---: |
| 2026-05 | 37 | 8,426,000 MNT | 227,730 MNT | 97.4% |
| 2026-06 | 12 | 2,552,000 MNT | 212,667 MNT | 100.0% |
| 2026-07 | 26 | 6,266,000 MNT | 241,000 MNT | 85.9% |
| 2026-08 | 60 | 14,735,100 MNT | 245,585 MNT | 83.1% |

Lifetime available in the production database:

- Paid Payments: 135
- Paid revenue: 31,979,100 MNT
- Average paid Order: 236,882 MNT
- First successful Payment: `2026-05-04 07:48:34 UTC`
- Latest successful Payment in this report: `2026-08-30 23:38:23 UTC`

Revenue recovered in July, then accelerated in August:

- July revenue grew 145.5% from June.
- August revenue grew 135.2% from July.
- August Payment count grew 130.8% from July while AOV grew only 1.9%, so
  volume caused almost all of the gain.
- The week starting `2026-08-24` produced 7,594,000 MNT from 24 Payments. That
  was 51.5% of August revenue and 23.7% of all recorded lifetime revenue.

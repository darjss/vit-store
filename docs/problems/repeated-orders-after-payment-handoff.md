# Repeated Orders After Payment Handoff

Status: confirmed in production

Implementation plan: `docs/problems/payment-recovery-plan.md`

## Problem

Customers can create several Orders for one intended purchase when a bank-app
handoff does not end with a visible payment confirmation in the storefront.
Each checkout submission creates a new Order and Payment, even when the same
Customer submitted the same cart moments earlier and the prior Payment remains
pending.

This happens most often in Facebook's iOS in-app browser. The bank app may fail
to open, open without completing payment, or return the Customer to a fresh
storefront route instead of the active payment screen. The cart survives, so
the Customer reasonably submits checkout again.

The repeated Orders are a system response to an uncertain payment state, not
evidence that the Customer intends several purchases.

## Customer Impact

- The Customer cannot tell whether the first Order or payment attempt still
  exists.
- Returning from a bank app can lose the payment screen and its recovery UI.
- The retained cart makes another checkout submission look like the correct
  recovery action.
- Several order numbers and payment attempts can exist for one purchase.
- A Customer may eventually pay one attempt while earlier attempts remain
  pending.

## Business Impact

- Raw order count overstates purchase intent and conversion.
- Admins must identify which repeated Order is authoritative.
- Pending Orders create fulfillment and customer-support risk.
- Stock, notifications, and downstream workflows may run for attempts that the
  Customer did not mean as separate purchases.
- High-value carts make accidental duplicate fulfillment especially costly.

## Production Evidence

### Facebook return loses payment state

On 2026-08-28, one Customer created three identical ten-item Orders for
1,121,000 MNT within 110 seconds:

| Order      | Result  | Observed path                                                                    |
| ---------- | ------- | -------------------------------------------------------------------------------- |
| `AM1ARE02` | Pending | Khaan Bank tapped; page left; Facebook returned to `/` after about 14 seconds    |
| `0M3ZBMDB` | Pending | Khaan Bank tapped; page left; Facebook returned to `/` after about 14 seconds    |
| `T7Q6QYPF` | Paid    | Customer kept the QPay QR visible; webhook confirmed payment; success page shown |

All three carts had the same product IDs, quantities, and prices. Order and
invoice creation succeeded each time. The server had already attached the
first active checkout to the Customer session, but the next checkout submission
still created a new Order.

The visual replay shows the Customer reopening the cart, entering checkout, and
submitting the full form after each return to `/`. Native bank screens are not
recorded, so the two Khaan outcomes remain unknown. On the third attempt, the
Customer viewed manual transfer details, returned to QPay, kept the QR visible,
and reached automatic payment confirmation.

PostHog session:
[`01a04790-b491-7f17-ab07-be026cd4a6b4`](https://us.posthog.com/project/262338/replay/01a04790-b491-7f17-ab07-be026cd4a6b4?t=2356)

### Confirmed deep-link failure followed by retries

On 2026-08-25, one Facebook iOS session created three identical 281,000 MNT
Orders. Khaan Bank and QPay Wallet taps repeatedly produced no handoff. All
three Payments remained pending.

PostHog session:
`01a03974-06ba-7cd7-8192-a3e0e00b03aa`

### Bank app opens but payment stays pending

Several Sono attempts emitted `bank_deeplink_app_opened`, yet no Sono Payment
was confirmed. One Customer retried several Orders, moved from Facebook to
Safari, and finally paid through Khaan Bank. Web replay cannot observe the
native bank app, but it shows the storefront remaining pending when the
Customer returns.

Relevant PostHog sessions:

- `01a03bb0-745f-768b-9924-3fa9af363b53`
- `01a04129-c6a8-73cc-98e6-7ed9f12159ce`
- `01a04166-c8c7-72df-91df-3be61dff45b8`
- `01a041d5-7390-7cda-b426-0146e9a31373`

## Observed Failure Modes

### No handoff

The Customer taps a bank, the browser remains visible, and payment recovery
appears only while the Customer stays on the payment screen.

### Handoff without payment

The browser becomes hidden, which proves only that focus left the page. The
bank app may open without loading the invoice or the Customer may return before
paying. The storefront receives no successful payment result.

### Return-state loss

The bank app opens, but Facebook resumes or reloads the storefront at `/`
instead of the active checkout. The payment context disappears while the cart
remains available.

### Same-cart resubmission

The Customer re-enters checkout and submits the retained cart. `order.addOrder`
creates another Order and Payment rather than returning the recent pending
attempt.

## Current System Behavior

- `apps/storev2/src/components/checkout/checkout-form.tsx` calls
  `order.addOrder` for each successful form submission and keeps payment state
  in the mounted checkout UI.
- `packages/api/src/routers/store/order.ts` creates the Order, Payment, checkout
  token, and Customer checkout-session claims.
- `packages/api/src/lib/session/checkout-access.ts` can authorize access to the
  active Order and Payment, but it does not define same-cart submission reuse.
- `apps/storev2/src/lib/deeplink-handoff.ts` observes page visibility for eight
  seconds. Its events describe browser visibility, not bank payment success.
- QPay webhooks and payment checks can confirm a Payment after the Customer
  leaves the storefront.

## Known Non-Causes

- The repeated Orders did not come from different carts in the confirmed cases.
- QPay invoice creation succeeded for the observed attempts.
- The final high-value payment webhook and success redirect worked normally.
- Messenger notification failures caused by Meta's messaging-window policy did
  not interrupt checkout; order mutations still returned HTTP 200.
- Extending the handoff timer reduced false `no_handoff` events but cannot
  preserve payment state across a Facebook reload.

## Problem Boundary

The system must distinguish a retry of one intended purchase from a new
purchase. Phone number and total alone are insufficient because a Customer may
legitimately place two Orders with the same total. Cart identity, payment state,
and a bounded time window are relevant signals.

The system must also preserve access to an active Payment after browser reload,
route loss, or return from a native bank app. A solution cannot depend only on
in-memory component state or a visibility event that may not flush before the
browser is suspended.

## Desired Outcome

- A rapid resubmission of an unchanged cart resolves to the active pending
  purchase instead of creating another Order.
- Returning from a bank app restores the exact active payment screen.
- A Customer can deliberately start a new purchase when that is their intent.
- Admin order counts represent distinct purchase intent.
- Analytics distinguish handoff, return, pending recovery, reuse, and confirmed
  payment.

## Success Measures

- No excess Order rows for an unchanged cart retried during the chosen reuse
  window.
- A bank-app return or storefront reload restores the active payment by its
  payment number.
- Reused attempts do not reserve or decrement stock twice.
- One successful payment maps to one fulfillable Order.
- PostHog can report `payment_confirmed` for QPay and measure recovery from bank
  handoff through final payment.

## Existing Recovery Work

- PR #295 added bank logos, handoff detection, QR-first behavior, inline Social
  Pay QR, and payment recovery UI.
- PR #296 extended the handoff timeout for the iOS consent dialog.

Those changes improve the payment screen. They do not protect Order creation
when that screen is lost or resubmitted.

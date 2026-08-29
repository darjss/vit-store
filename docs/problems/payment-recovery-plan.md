# Payment recovery plan

Status: implementing as stacked PRs

Problem evidence:

- `docs/problems/repeated-orders-after-payment-handoff.md`
- `/tmp/opencode/payment-recovery-problems-only-handoff.md`

## Goal

One unpaid payable Payment per shopper (phone). Bank return to `/` shows a
continue-checkout sheet, not a hard redirect. Profile shows unpaid clearly with
a continue-payment action. Retries reuse the unpaid Payment; a real new cart
cancels the old one first.

## Non-goals

- Cart fingerprint compare in the client
- Keep-vs-abandon choice sheets on every landing
- Persisting the in-tab bank recovery sheet in `sessionStorage`
- New Payment statuses (`superseded`, `abandoned`)
- Shared payment UI package across tracking and profile
- 404 navigation spike

## Invariant

At most one payable unpaid Payment per phone. Server owns it. Identity that
survives Facebook killing the webview is the phone the shopper types again, not
a client checkout id in a dead session.

## Plan

### 1. Continue sheet instead of hard resume

Replace `ResumePendingPayment` (`location.replace`) with a dismissible bottom
sheet: unpaid Payment exists → “Төлбөр үргэлжлүүлэх” links to `paymentUrl`.

Do:

- Rewrite the island used on index, cart, and checkout.
- Remove checkout-form silent yank on mount and on submit when a pending
  Payment exists. Let the sheet offer continue; let `addOrder` decide reuse.
- Social Pay uses the same bank deeplink path as other banks (no inline-QR
  special case).

Done when: return to `/` with a pending Payment shows a sheet, never auto-
redirects; checkout can submit a new cart without being yanked.

### 2. Server: reuse or replace unpaid Payment by phone

Do:

- Before insert in `addOrder`, find the latest payable unpaid Payment for this
  phone (`pending` or `customer_claimed_paid`).
- Same cart (order line `productId`+`qty` match): return existing
  order/payment/token. No second notify, no second QPay precreate.
- Different cart: set prior Payment `failed`, prior Order `cancelled`, then
  create the new Order/Payment in the same transaction.
- Serialize so two submits cannot both insert (row lock or equivalent).

Done when: same-cart retries in ~110s produce one Order; a changed cart leaves
at most one payable pending Payment.

### 3. Profile: unpaid + continue payment

Do:

- Load latest Payment on profile orders.
- Badge from Payment status (unpaid / under review / paid).
- Map Order `created`.
- Pending or claimed: CTA to `paymentUrl(paymentNumber)`.

Done when: leftover attempts read as unpaid with a clear next step.

## Ship order (stack bottom → top)

1. Continue sheet + Social Pay deeplink + remove checkout yank
2. `addOrder` reuse-or-replace by phone
3. Profile Payment badge + CTA

## Success measures

- Home/cart never auto-redirect to payment; sheet offers continue.
- Same-cart retries → one Order.
- Different-cart create → prior unpaid cancelled/failed.
- Profile shows Payment state and a working continue link.

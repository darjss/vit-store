# Khan Bank Handoff Fails Inside Facebook iOS

Status: storefront recovery now drops any bank that fails handoff

## Problem

Khan Bank is the most frequently selected QPay bank app in the storefront, but
its direct app handoff often fails inside Facebook's iOS in-app browser.

The QPay invoice is created and the customer taps Khan Bank, but Facebook often
remains visible instead of opening the Khan Bank app. Customers then retry the
same bank, choose another payment path, leave the checkout, or return later.

This is not a general Khan Bank payment-processing failure. Observed Payments
usually succeed when the Khan Bank app actually opens. The failure is
concentrated in the browser-to-app transition from Facebook iOS.

This problem is one part of the wider recovery journey documented in:

- `docs/problems/repeated-orders-after-payment-handoff.md`
- `docs/problems/payment-recovery-plan.md`

## Production Evidence

PostHog bank-handoff events from 2026-08-25 through 2026-08-30 show:

| Context | Clicks | Payments | App opened | No handoff | No recorded outcome |
| --- | ---: | ---: | ---: | ---: | ---: |
| Facebook in-app browser | 19 | 12 | 6 | 10 | 3 |
| Browser outside Facebook | 2 | 2 | 2 | 0 | 0 |
| Total | 21 | 14 | 8 | 10 | 3 |

Only 6 of 19 Facebook taps produced an observed Khan Bank app handoff. Both
non-Facebook taps produced a handoff.

All eight Payments with an observed Khan Bank handoff eventually reached
`success`. Nine of the fourteen Payments that included a Khan Bank tap
eventually succeeded, although at least one succeeded later through QPay QR
after the Khan handoff failed.

The event `bank_deeplink_app_opened` means the browser became hidden after the
tap. It does not expose the native Khan Bank screen or prove which confirmation
steps the customer completed there.

## Evidence After Deeplink Changes

PR #295, merged at 2026-08-25 18:21 Mongolia time, added the current handoff
detection and recovery stack. Every Khan Bank tap in this dataset occurred
after that merge.

PR #296, merged at 2026-08-25 18:55 Mongolia time, extended the iOS handoff
timeout from 2.5 seconds to 8 seconds. Twenty of the twenty-one Khan Bank taps
occurred after that merge.

After the eight-second timeout change and before PR #299:

| Khan Bank result | Taps |
| --- | ---: |
| App opened | 8 |
| No handoff | 5 |
| No recorded outcome | 3 |

The longer timeout removed the first known short-timeout case from the later
sample, but it did not remove Facebook handoff failures.

PR #299 added pending-Payment restoration on 2026-08-29 at 00:38 Mongolia time.
PR #300 replaced hard restoration with a continue sheet on 2026-08-29 at 20:21.
The only later Khan sample contains four taps from one Facebook iOS customer;
all four produced `bank_deeplink_no_handoff`.

## Repeated Khan Attempt

On 2026-08-30, one returning Facebook iOS customer reached the same existing
Payment and tapped Khan Bank four times in about 69 seconds.

Each tap remained visible for eight seconds and emitted
`bank_deeplink_no_handoff`. The recovery sheet appeared after every attempt.
The customer selected QR three times and transfer once before the Payment later
reached QPay success.

The session demonstrates that recovery UI can keep the customer in the payment
journey while the Khan Bank handoff repeatedly fails. It also demonstrates a
retry loop: the same unavailable direct action remains easy to select after
each failure.

PostHog replay:
[`01a05065-ca06-7feb-a6e4-ffb363b79bda`](https://us.posthog.com/project/262338/replay/01a05065-ca06-7feb-a6e4-ffb363b79bda?t=220)

## Current Storefront Behavior

`apps/storev2/src/components/payment/qpay-button.tsx` renders the bank links
returned by the QPay invoice response.

For every bank, the component currently:

- starts the same visibility-based handoff watcher;
- waits eight seconds before declaring no handoff;
- records the bank name in analytics and handoff state;
- displays the same recovery sheet after failure;
- returns the customer to the full bank list when recovery is dismissed.

The current recovery sheet says:

```text
Апп нээгдсэнгүй

QPay-ийн банкны апп ажилласангүй. Өөрөөр төлье?

[ QR код уншуулах ]
[ Дансаар шилжүүлэх ]
[ Банкаа дахин сонгох ]
```

The sheet does not identify Khan Bank, mention Facebook's in-app browser, or
distinguish a first failure from repeated Khan failures.

`apps/storev2/src/lib/analytics.ts` detects Facebook for analytics properties.

After any `no_handoff`, the storefront names that bank, opens QR, and removes
its tile for the rest of the page. Khan in Facebook is the production case that
forced the change. The recovery path is the same for every bank.

## Comparison With Other QPay Apps

The same production period shows different failure shapes for other apps:

| App | Payments | Clicks | App opened | No handoff | Eventually paid |
| --- | ---: | ---: | ---: | ---: | ---: |
| Khan Bank | 14 | 21 | 8 | 10 | 9 |
| Sono | 8 | 12 | 11 | 1 | 0 |
| Trade and Development Bank | 3 | 4 | 4 | 0 | 3 |

Sono generally opens but none of its selected Payments completed. Its failure
occurs after browser handoff and is separate from the Khan Bank/Facebook issue.

Trade and Development Bank opened on every observed tap and all three Payments
completed. The sample is small, but it shows that Facebook does not block every
QPay app scheme equally.

QPay's official deeplink page publishes separate URI schemes for each app,
including `khanbank://q?qPay_QRcode=...`. The storefront receives and renders
these provider-specific links rather than constructing one common QPay app
handoff.

Source: [QPay Deeplink](https://qpay.mn/q)

## Customer Impact

- The most familiar bank choice often appears unresponsive inside Facebook.
- A customer can wait eight seconds repeatedly without reaching the bank app.
- The generic error does not explain why Khan Bank failed in Facebook while the
  same app may work from Safari.
- Repeated attempts increase uncertainty about whether payment started.
- Customers move between direct QPay, QR, transfer, cart, checkout, and profile
  without a stable explanation of the failed handoff.
- Some customers abandon a valid QPay invoice even though another payment path
  remains available.

## Business Impact

- The highest-demand bank path has low handoff reliability in a major traffic
  source.
- QPay conversion is reduced even when invoice creation and payment polling work.
- Repeated Khan taps add friction before customers choose transfer or QR.
- Support receives reports framed as QPay or Khan Bank payment failures even
  when the failure occurred in Facebook's browser.
- Aggregate QPay conversion hides the difference between a failed browser
  handoff and a native app that opened but did not complete payment.

## Known Non-Causes

- QPay invoice creation succeeded for the observed Khan attempts.
- The eight-second iOS consent timeout was active for twenty of twenty-one taps.
- Khan Bank is not failing on every platform; both observed non-Facebook taps
  opened the app.
- Khan payment processing is not the main observed failure; all eight Payments
  with a clear Khan handoff eventually succeeded.
- The behavior is not shared equally by all QPay app schemes.

## Problem Boundary

The storefront can observe a bank-link click, page visibility, return to the
browser, QPay polling, and final Payment state. It cannot observe Facebook's iOS
scheme-routing decision, the native Khan Bank screen, customer authentication,
or confirmation inside the bank app.

`bank_deeplink_app_opened` is an inferred browser handoff, not native app
telemetry. `bank_deeplink_no_handoff` means the storefront stayed visible for
eight seconds; it does not identify whether Facebook blocked the scheme, an iOS
consent prompt remained open, or the customer declined to continue.

The dataset contains fourteen Khan-selected Payments and only two non-Facebook
Khan taps. It establishes a strong production pattern but not a complete rate
for all Khan Bank customers.

## Related Files

- `apps/storev2/src/components/payment/qpay-button.tsx`
- `apps/storev2/src/lib/deeplink-handoff.ts`
- `apps/storev2/src/lib/analytics.ts`
- `apps/storev2/src/components/payment/continue-unpaid-checkout.tsx`
- `apps/storev2/src/components/payment/payment-options.tsx`

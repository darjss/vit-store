# Better Result / dismatch thermo-nuclear review

## Review decision

**Block.** This one-pass review found four high-severity correctness or security defects and three lower-severity migration gaps.

Reviewed range: `d0e17f41eed0c677b93c0cae26bc96cf94957d41...HEAD`

The branch was reported green with 74 tests, root `check-types`, and server/agent builds. I did not repeat those checks because this pass changed only this report.

## Priority findings

### P0 — The legacy Messenger webhook can confirm or reject payments without a Meta signature

**Locations**

- `apps/server/src/routes/webhooks.ts:12-58`
- `packages/api/src/lib/integrations/messenger/webhook.ts:11-72`
- Flue reference: `/home/darjs/.btca/agent/sandbox/flue/packages/messenger/src/webhook.ts:45-52,69`

**Problem**

The server route parses JSON and applies a local shape check, but it does not verify `X-Hub-Signature-256`, the exact request bytes, or the configured Page ID. It then forwards the payload to code that accepts `confirm_payment:<paymentNumber>` and `reject_payment:<paymentNumber>` postbacks. Those branches call `confirmPaymentAndNotify` or set the payment to `failed`.

This is an unauthenticated commerce write. A caller that can reach `/webhooks/messenger` can forge a postback and change payment, stock, sales, order, and notification state. The new validation does not provide authenticity.

This also keeps a second inbound Messenger parser beside `@flue/messenger`. That conflicts with the project rule that Flue owns inbound verification, parsing, and conversation identity. The local Flue implementation verifies the signature over the exact body before it calls the application webhook.

**Required correction**

Route this endpoint through `createMessengerChannel`, or retire the endpoint and move these payment postbacks behind the existing Flue channel. Keep one canonical inbound implementation. Do not add another custom signature helper.

**Proof required**

- Missing, malformed, or wrong signatures do not reach payment code.
- A valid signature over changed bytes is rejected.
- A signed payload for a different Page is rejected.
- A valid duplicate remains safe through the payment confirmation boundary.

### P1 — Messenger assistant checkout does not use the new idempotency protocol

**Locations**

- `packages/assistant/src/checkout.ts:74-103,266-289`
- `apps/agent/src/lib/order.ts:87-108`
- `packages/shared/src/schema.ts:372-389`
- `plans/better-result-production-runtime-migration.md:473-482`

**Problem**

The shared `newOrderSchema` accepts `idempotencyKey`, and the storefront retains one key for an unchanged checkout. The assistant `CheckoutState` and `CheckoutOrderPayload` do not contain a key. The agent sends the payload to legacy `order.addOrder` without one.

The agent therefore has no database replay identity when the server commits but the response is lost. The client classifies that case as `AmbiguousOrderFailure`. It also leaves the durable checkout phase at `creating`, so the customer cannot safely retry through the tool. A later reset or manual retry can create a second order because there is no stable key to replay.

This directly misses the migration requirement to retain one key per unchanged storefront **and assistant/agent** checkout attempt.

**Required correction**

Generate one `checkout_<uuid>` key when an assistant checkout attempt becomes ready. Persist it in `CheckoutState`, include it in every retry of the same normalized payload, and rotate it only when the checkout payload changes or the attempt finishes. Move the agent to the v2 Result procedure when this can be done without a lockstep deployment. Do not run legacy and v2 writes in parallel.

**Proof required**

- A committed response-loss retry returns the same order and payment.
- Two concurrent `place_order` calls create one order.
- A changed payload with the same key returns `CheckoutKeyConflict`.
- A retry after an ambiguous outcome is possible and uses the same key.

### P1 — QPay invoice completion can return a payable QR after the payment has already changed state

**Locations**

- `packages/api/src/lib/payments/qpay-invoice.ts:51-99`
- `packages/api/src/queries/qpay-invoices.ts:98-132`

**Problem**

`ensureQpayInvoiceForPayment` checks payment state before the external QPay request. After QPay accepts the invoice, `qpayInvoiceQueries.complete` first marks the local invoice `created`. It then updates `PaymentsTable` only when the payment is still `pending`, but it ignores whether that update changed a row and returns `true` in all cases.

A payment confirmation or transfer selection can win while the QPay request is in flight. In that race, `complete` still returns success and `fromClaim` returns the QPay response. The UI can show a live QR for an already confirmed or otherwise non-pending payment. A customer can then pay twice. The persisted QPay row also claims `created` even though its invoice was not attached to the payment.

**Required correction**

Make the local completion decision atomic with a locked, current payment-state check. A completion that cannot attach the invoice must not return `Ok<QpayInvoice>` or cache the QR. Record it as ambiguous/manual-review state and use provider cancellation or reconciliation if QPay supports it. The payment row update result must be part of the completion result.

**Proof required**

Use a deferred provider response and race it with payment confirmation, rejection, and transfer selection. None of those races may expose a payable QR after the payment leaves the allowed QPay state.

### P1 — Generic tRPC logging bypasses the new allowlisted Result projection

**Locations**

- `packages/api/src/lib/trpc.ts:51-55,92-96,145-209`
- `packages/api/src/operations/serialize-operation-result.ts:10-21`
- `packages/shared/src/result/log-projection.ts:1-91`

**Problem**

`serializeOperationResult` writes a safe `operation_result` projection. The generic tRPC middleware then logs the complete summarized input and output for the same operation. `summarizeTrpcPayload` limits size, but it does not redact fields.

For v2 checkout, the input can contain phone, address, notes, and the idempotency key. The successful output contains `checkoutToken` and customer data. Admin customer Results contain phone and address. The auth middleware also writes customer phone and admin email directly to log context.

The safe projection therefore does not establish a safe logging boundary. The same event contains both the allowlisted projection and raw sensitive values.

**Required correction**

Make the generic tRPC event structural only: procedure, type, duration, outcome, safe counts, and correlation ID. Use `operation_result` as the only Result payload projection. Add explicit per-procedure projections only when needed. Do not maintain two competing output log implementations.

**Proof required**

Capture a v2 checkout log with known phone, address, notes, idempotency key, and checkout token. Assert that none of those values occurs in the emitted event. Add the same proof for an admin customer Result and an unexpected failure.

### P2 — Expected admin lookup failures remain transport errors or hidden sentinels

**Locations**

- `packages/api/src/routers/admin/order.ts:173-188,307-399`
- `packages/api/src/routers/admin/product.ts:146-157,302-364`
- `packages/api/src/routers/admin/purchase.ts:81-99,233-305`

**Problem**

The new admin v2 routers cover mutations, but not first-party detail reads. Missing orders and products still throw `TRPCError(NOT_FOUND)`. Missing purchases still return an `undefined` query sentinel. These are expected lookup outcomes, not infrastructure failures.

As a result, the same `OrderNotFound` and resource-not-found concepts use typed Results for writes but transport exceptions or sentinels for reads. Product and order detail pages can show the generic transport error state for a normal deletion or stale link. Purchase detail has a separate local sentinel path.

**Required correction**

Add canonical Result-based lookup operations and additive v2 read procedures. Keep the old read procedures as adapters until their clients move. Use one not-found presentation path in the admin UI. Unknown database failures must still throw.

**Proof required**

For order, product, and purchase detail reads, prove that not-found is a validated expected `Err`, malformed wire data is a transport failure, and database failure remains thrown.

### P2 — Closed three-or-more-way branches are still non-exhaustive

**Locations**

- `apps/server/src/routes/uploads.ts:558-566`
- `packages/api/src/operations/admin-payment/index.ts:27-42`

**Problem**

The upload route handles the closed `complete | partial | error` response with two `if` statements and treats every other value as HTTP 200. The admin payment operation handles the four payment statuses with two checks and treats every remaining status as confirmable.

These branches work for the current variants, but they do not fail compilation when a new variant is added. A new upload state silently becomes success. A new payment state silently enters confirmation. This is the exact class of regression that the migration's `dismatch` rule is intended to prevent.

**Required correction**

Use exhaustive `match` on upload `status`. Map payment status to an explicit exhaustive action before confirmation. Do not use a default branch.

**Proof required**

Keep the union closed and let TypeScript fail when a test-only variant is added without a handler.

### P2 — The new checkout notification path persists raw provider errors

**Locations**

- `packages/api/src/operations/checkout/create-order.ts:48-79`
- `packages/api/src/lib/integrations/messenger/failed-notifications.ts:12-58`

**Problem**

The migration extends `persistMessengerNotificationFailure` to the new `order_created` post-commit path. That helper stores arbitrary `Error.message`, `String(error)`, and an unvalidated `code` in the database. Messenger SDK errors can carry provider diagnostics, and unknown errors have no safe-field contract.

This bypasses the migration's typed delivery failures and allowlisted error projection. It creates a durable raw-error sink even though the public Result path is strict.

**Required correction**

Classify the send at the Messenger adapter boundary and persist only an allowlisted delivery tag, provider, code, retryability, correlation ID, and operation. Keep the raw exception only in the centralized protected diagnostic channel if policy allows it. Do not return the raw caught error from retry helpers.

**Proof required**

Persist a synthetic error that contains a token, phone, provider body, stack, and cause. Assert that none of those values reaches the failure row or any public/admin response.

## Areas checked with no additional high-confidence finding

- The core serialized Result envelope uses strict Valibot branch validation before hydration.
- The reviewed legacy mutation adapters call the same canonical operation as v2 and do not run duplicate writes in parallel.
- Payment confirmation keeps status change, stock transition, sales rows, outbox rows, and recovery rows in one transaction.
- The Flue agent channel uses Flue conversation identity and exact-body verification correctly; the blocker is the separate server webhook.
- The transfer reconciliation Durable Object uses exhaustive matching for its current multi-variant provider and reconciliation states.

## Approval status

**Not approved.** Fix P0 and P1 findings before merge. P2 findings are also within the stated migration acceptance criteria and should not be deferred without an explicit scope decision.

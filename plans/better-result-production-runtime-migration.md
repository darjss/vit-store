# Better Result production-runtime migration plan

> **Planning only:** This document does not authorize implementation, deployment, schema migration, or remote writes.
>
> **Executor instructions:** Read this plan completely before changing code. Implement it as a sequence of independently deployable changes. Do not perform a big-bang wire-format switch. Keep expected business failures in typed `Result` values, and keep programmer defects, impossible states, framework control flow, and unknown infrastructure failures as thrown exceptions.

## Status

- **State:** Proposed
- **Scope:** All production runtime code in `apps/storev2`, `apps/admin`, `apps/server`, `apps/agent`, `packages/api`, `packages/assistant`, and `packages/shared`
- **Excluded:** scripts, CLIs, tests being used only as tools, generated files, component/provider invariant throws, redirects, and exhaustiveness assertions
- **Baseline:** `d0e17f41eed0c677b93c0cae26bc96cf94957d41` (`feat(admin): group active order queue`)
- **Risk:** High
- **Delivery model:** One initiative, multiple compatible PRs and deployments
- **Reference implementation:** `/home/darjs/dev/store-kit`
- **Library snapshots reviewed:** `better-result@2.10.0` at upstream commit `0d1d792f4e409cf08cbee1a10a64ec951636577f`; `dismatch@2.6.0`

## Goal

Make every expected, recoverable production failure explicit and exhaustively handled from domain operation to user interface. The migration must:

1. Replace business-rule exceptions, message-string comparisons, ambiguous `null` sentinels, and false empty-data fallbacks with operation-specific `Result<Value, Failure>` contracts.
2. Preserve unexpected exceptions as unexpected. They must be logged once, sanitized at the public boundary, and rendered as transport or system failures.
3. Give storefront and admin users safe Mongolian messages that explain what happened, state impact, and the next action.
4. Preserve webhook acknowledgment rules, HTTP status semantics, transaction boundaries, idempotency, retries, and provider-specific recovery behavior.
5. Avoid a lockstep deployment by keeping old procedures compatible while new serialized-Result procedures are introduced and adopted.

## Why this is a full rewrite without using Result everywhere

“Full rewrite” applies to the production error model, not every function signature.

Use Better Result when a caller can recover differently from a known outcome. Do not wrap:

- component/provider invariants such as missing React or Solid context;
- impossible persisted states that indicate a defect;
- redirects and framework control flow;
- plain read operations with no expected business failure;
- unknown database, runtime, or serialization defects.

Those conditions continue to throw and reach the centralized unexpected-error boundary.

## Evidence from the current repository

The production backend currently has:

- 4 project-owned `Error` subclasses, with only one active nominal domain error;
- 199 `TRPCError` constructors across 8 transport codes;
- 54 generic backend `throw new Error(...)` sites;
- exact message matching for `"Purchase not found"` in `packages/api/src/routers/admin/purchase.ts:118-122,165-169,187-191`;
- expected purchase rules thrown as strings in `packages/api/src/queries/purchases.ts:220-248,495-558,611-623`;
- stock transition conditions collapsed to `null` in `packages/api/src/lib/stock/transition.ts:20-48`;
- raw UI use of `error.message` in `apps/storev2/src/lib/query.ts:63-68` and `apps/admin/src/utils/trpc.ts:23-40`;
- customer order-history failures rendered as an empty history in `apps/storev2/src/pages/profile.astro:44-49`;
- payment polling without a visible query-error branch in `apps/storev2/src/components/payment/payment-status.tsx:32-67` and `qpay-button.tsx:75-101`.

The strongest existing local pattern is `ConfirmPaymentResult` in `packages/api/src/lib/payments/transfer-confirmation.ts:46-54`, but it is isolated and is not carried consistently through transport and UI.

## Store Kit patterns to copy

Store Kit uses this sequence:

1. Plain browser-safe `_tag` unions live in contracts: `packages/contracts/src/checkout.ts:117-153`.
2. Small factories return objects with `satisfies`: `packages/commerce/src/errors/checkout.ts:5-35`.
3. Commerce operations return Better Result for expected outcomes: `packages/commerce/src/checkout/operations.ts:187-209`.
4. Unknown provider failures are caught at adapters: `packages/commerce/src/adapters/qpay.ts:87-143`.
5. APIs use `Result.serialize`: `packages/api/src/routes/shopping.ts:21-27,84-103`.
6. The storefront uses one deserialization helper: `packages/storefront/src/query-options/result.ts:18-60`.
7. UI behavior is selected exhaustively by `_tag` with `dismatch`: `packages/storefront/src/checkout.tsx:74-86`.
8. Domain operations use `dismatch/async` for multi-variant asynchronous state transitions: `packages/commerce/src/payments/operations.ts:45-95`.
9. Checkout uses request-bound idempotency and database replay: `packages/commerce/src/checkout/operations.ts:67-74,170-190,227-286`.

## Store Kit patterns not to copy

1. Do not send `TaggedError` classes over RPC. JSON drops prototypes, while `TaggedError.toJSON()` can include message, cause, and stack.
2. Do not assume `Result.deserialize<T, E>` validates `T` or `E`. Better Result validates only the outer `{ status, value | error }` envelope.
3. Do not convert internal consistency defects into ordinary business failures.
4. Do not call leases or provider retries “exactly once.” Ambiguous delivery remains possible.
5. Do not add a separate error variant for every helper. Error unions belong to operation boundaries.
6. Do not use `.unwrap()` in production runtime code.
7. Do not assume Better Result provides transactions, idempotency, leases, or retries appropriate for commerce.
8. Do not use a catch-all/default dismatch branch for a closed public error union. New variants must fail compilation until handled.

## Better Result and dismatch rules for Vit Store

### Allowed APIs

Use the verified public APIs:

- `Result.ok`
- `Result.err`
- `Result.try` and `Result.tryPromise` at throwing adapter boundaries
- `map`, `mapError`, `andThen`, `andThenAsync`, and `match`
- `Result.gen` and `Result.await` only when they make multi-step result composition clearer
- `Result.serialize` and `Result.deserialize` at first-party RPC boundaries
- `ResultDeserializationError` for malformed envelopes

### Dismatch branching rule

Use `dismatch@2.6.0` whenever one discriminant or state value has **three or more possible branches**. This applies across API operations, adapters, frontend presentation maps, assistant tools, agent state machines, Durable Objects, and background jobs.

- Use `match(value, "_tag")({...})` for synchronous plain tagged unions.
- Use `matchAsync(value, "_tag")({...})` from `dismatch/async` when handlers are asynchronous.
- Use the existing discriminant (`_tag`, `status`, `state`, `outcome`, or another literal field). Do not rename a stable wire contract only to satisfy this rule.
- Use Better Result’s `.match({ ok, err })` for the binary Result container. Inside the `err` branch, use dismatch when the error union has three or more tags.
- Two-way decisions can stay as `if`, a conditional expression, a two-case `switch`, or Better Result `.match`.
- Independent guard clauses, numeric ranges, boolean conjunctions, and validation pipelines are not discriminated-union matching. Do not force them into dismatch.
- Closed production unions must use exhaustive `match` or `matchAsync`. `matchWithDefault` is allowed only at untrusted or open external boundaries after runtime validation, never for public operation errors or UI presentation maps.
- Prefer matching once over nested chains of conditionals. Do not use dismatch for a single condition.

```ts
import { match } from "dismatch";

const presentation = match(error, "_tag")<ErrorPresentation>({
	CartEmpty: () => cartEmptyPresentation,
	CartChanged: ({ corrections }) => changedCartPresentation(corrections),
	InsufficientStock: ({ items }) => insufficientStockPresentation(items),
});
```

### Banned runtime patterns

- `.unwrap()` outside tests
- `TaggedError.toJSON()` in transport or telemetry
- `instanceof` checks after RPC, Worker structured clone, KV, DO, or JSON boundaries
- public error variants containing stack, cause, provider body, token, phone, address, fingerprint, or credentials
- `error.message` as a machine code
- broad `catch` blocks that relabel all unknown failures as an expected domain error

### Dependency placement

Pin one version each for `better-result@2.10.0` and `dismatch@2.6.0` in the root workspace catalog, then add dependencies with install commands to every direct importer. Expected direct importers are:

- `packages/shared`, for validated result-envelope helpers;
- `packages/api`, for domain operations and serialization;
- `packages/assistant`, for checkout/tool operations;
- `apps/storev2`, for Solid Query result consumption;
- `apps/admin`, for React Query result consumption;
- `apps/agent`, for bot-result consumption and internal delivery outcomes;
- `apps/server` only if REST/DO adapters directly construct or match Results.

Do not edit manifests manually. Use `bun add better-result@2.10.0 dismatch@2.6.0` from each package directory that imports both libraries. Install only the library a package imports when it needs one of them.

## Target architecture

### 1. Shared contracts stay plain and serializable

Add:

```text
packages/shared/src/contracts/errors/
  auth.ts
  checkout.ts
  order.ts
  payment.ts
  product.ts
  restock.ts
  admin-catalog.ts
  admin-order.ts
  purchase.ts
  ai.ts
  upload.ts
packages/shared/src/result/
  serialized-result.ts
  deserialize-result.ts
```

Each public failure schema must:

- use a literal `_tag` discriminant;
- contain only JSON/SuperJSON-safe values;
- contain a safe Mongolian `message` when one canonical message is useful;
- include structured recovery metadata instead of asking the UI to parse copy;
- reject additional fields where the current schema tooling supports it;
- infer the TypeScript union from the Valibot schema;
- remain independent of backend provider error classes.

`deserialize-result.ts` must validate both the Better Result envelope and the nested success/error payload with Valibot before returning a hydrated Result. Treat malformed wire data as a transport defect, not an expected domain failure.

### 2. Operations own expected failure unions

Add a thin operation layer without moving persistence code unnecessarily:

```text
packages/api/src/operations/
  auth/
  checkout/
  order/
  payment/
  product/
  restock/
  admin-catalog/
  admin-order/
  purchase/
  ai/
  upload/
packages/api/src/errors/
  internal-provider-errors.ts
  factories/
```

Rules:

- Query modules perform persistence and may throw unknown database defects.
- Operation modules turn known query outcomes into `Result` values.
- Routers validate input, call one operation, serialize its result, and do not own business error construction.
- External adapters use `Result.tryPromise` with a custom error mapper and validate unknown provider responses.
- Internal provider unions are mapped to public operation errors before leaving `packages/api`.

### 3. Expected and unexpected transport paths stay separate

For first-party tRPC procedures with expected failures:

```text
operation Result<T, E>
  -> Result.serialize
  -> tRPC success response
  -> validated Result.deserialize
  -> TanStack query/mutation data
```

For unexpected failures:

```text
throw
  -> centralized tRPC logging middleware
  -> sanitized INTERNAL_SERVER_ERROR
  -> TanStack query/mutation error
  -> generic recoverable system UI
```

Malformed input remains tRPC validation failure. Missing authentication at a protected procedure remains transport `UNAUTHORIZED` unless the caller needs an operation-specific recovery branch beyond signing in.

### 4. Do not force Result semantics onto external webhook protocols

QPay, Messenger, and other provider webhooks must continue to return the status that controls provider retry behavior:

- invalid request: current 4xx behavior;
- accepted or intentionally ignored duplicate: 2xx;
- retryable processing failure: 503 only where the provider contract expects retry;
- unexpected server defect: centralized 5xx handling.

Better Result may model the internal processing outcome, but the HTTP adapter must match it explicitly to provider-specific status and body.

### 5. UI consumes domain failures as data

Add framework-local helpers:

```text
apps/storev2/src/lib/result-query.ts
apps/storev2/src/lib/error-presentations/
apps/admin/src/lib/result-query.ts
apps/admin/src/lib/error-presentations/
```

The helpers must keep:

- expected `Err` in query/mutation data;
- transport/unexpected failure in TanStack `isError`/`error`;
- malformed serialized data as a thrown transport failure.

Every public failure union needs one exhaustive dismatch presentation mapper. Any union with three or more variants must use `match(error, "_tag")`; adding a variant must produce a compile error until its presentation is added. A presentation contains:

```ts
{
  title: string;
  description: string;
  reassurance?: string;
  actions: readonly Action[];
}
```

Do not render backend or provider `error.message` directly. Unknown transport failures use one sanitized Mongolian fallback plus retry and a way out. Admin production error pages show a correlation ID, not stack or raw error details.

## Initial error taxonomy

The executor must refine fields against live schemas, but may not change the recovery meaning without review.

### Customer authentication

`AuthError`:

- `OtpSendRateLimited { retryAfterSeconds }`
- `OtpAttemptRateLimited { retryAfterSeconds }`
- `OtpInvalidOrExpired`
- `OtpDeliveryUnavailable { retryable }`
- `PhoneVerificationRequired`
- `SessionExpired`

Keep “not signed in” indistinguishable from an invalid or expired session where disclosure would weaken security.

### Checkout and order creation

`CheckoutError`:

- `CartEmpty`
- `CartChanged { corrections }`
- `InvalidCheckoutDetails { fields }`
- `ProductUnavailable { productId, productName? }`
- `InsufficientStock { items: [{ productId, productName, requested, available }] }`
- `DeliveryUnavailable`
- `CheckoutKeyConflict`
- `CheckoutRecoveryRequired { orderNumber? }`

An idempotent replay is `Ok`, not an error.

`OrderAccessError`:

- `OrderNotFound`
- `OrderAccessDenied`

### Payments

`PaymentError`:

- `PaymentNotFound`
- `PaymentAccessDenied`
- `PaymentAlreadyConfirmed { orderNumber? }`
- `PaymentNotPending { status }`
- `PaymentMethodMismatch { expected, actual }`
- `PaymentProviderUnavailable { provider, retryable, fallbackMethods }`
- `PaymentConfirmationConflict { retryable }`
- `BankTransactionAlreadyConsumed`
- `ManualReviewRequired { paymentStatus }`

Internal QPay, Khaan, cache, and notification errors must not cross this boundary.

### Product, stock, search, and restock

`ProductError`:

- `ProductNotFound`
- `ProductUnavailable`
- `InsufficientStock { requested, available }`
- `SearchUnavailable { retryable }`

`StockTransitionError`:

- `ProductNotFound`
- `ProductInactive`
- `InsufficientStock { current, delta }`
- `ConcurrentStockUpdate`

`RestockError`:

- `InvalidContact { channel }`
- `ContactNotVerified`
- `SubscriptionLimitReached`
- `RestockRateLimited { retryAfterSeconds }`
- `ProductNotFound`
- `ProductAlreadyInStock`

A duplicate restock subscription remains idempotent `Ok`.

### Admin catalog

`CatalogMutationError`:

- `ResourceNotFound { resource, id }`
- `DuplicateResource { resource, field }`
- `DeleteBlocked { resource, reason }`
- `InvalidCatalogState { resource, reason }`
- `StockConflict { productId, available? }`
- `ConcurrentUpdate { resource, id }`

Read-only analytics/database outages remain unexpected transport failures. They must not become zero values or empty arrays.

### Admin orders and delivery

`AdminOrderError`:

- `OrderNotFound`
- `InvalidOrderTransition { from, to }`
- `StockConflict { items }`
- `DeliverySubmissionFailed { retryable }`
- `BatchPartiallyFailed { failures }`

Batch operations should return one aggregate result. Do not emit one global toast per failed item.

### Purchases

`PurchaseError`:

- `PurchaseNotFound`
- `PurchaseItemNotFound`
- `CannotRemoveReceivedItem`
- `OrderedQuantityBelowReceived { received }`
- `CancelledPurchaseCannotReceive`
- `ReceiptItemsMismatch`
- `ReceiptExceedsRemaining { remaining }`
- `CannotDeletePurchaseWithReceipts`
- `InvalidPurchaseTransition { from, to }`

This union replaces all exact English message comparisons in purchase routers.

### AI and uploads

`AiOperationError`:

- `InvalidSource`
- `ExtractionFailed { retryable }`
- `InvalidModelOutput`
- `ProductResolutionRequired { lines }`
- `NoUsableImages`
- `ProviderUnavailable { retryable }`

`UploadError`:

- `ImageRequired`
- `UnsupportedImageType { received, allowed }`
- `ImageTooLarge { maximumBytes }`
- `TooManyImages { maximum }`
- `ImageFetchFailed { index, retryable }`
- `ImageTransformFailed { index }`
- `StorageUnavailable { retryable }`

For multi-image upload, successful images plus per-item failures are a partial-success `Ok` DTO, not a total `Err`, unless nothing can be committed safely.

### Assistant and Messenger agent

Replace open `error: string` checkout results with a closed `AssistantCheckoutError`:

- `CheckoutNotStarted`
- `CartNotConfirmed`
- `InvalidPhone`
- `AddressRequired`
- `DeliveryZoneNotSelected`
- `CheckoutAlreadyCreating`
- `SummaryNotConfirmed`
- `OrderCreationFailed { retryable, recovery }`

Use internal delivery unions for Messenger/SMS:

- `RetryableDeliveryFailure`
- `AmbiguousDelivery`
- `PermanentDeliveryFailure`
- `DuplicateInboundDelivery`

Before implementing agent changes, inspect the installed/local Flue source with `btca-local`. Preserve `@flue/messenger` ownership of inbound verification, parsing, and conversation identity. Keep Flue tool output as plain Valibot-valid records even when operations use Result internally.

## Compatibility and deployment strategy

A direct conversion of existing tRPC success DTOs to serialized Result envelopes would break old clients when the server deploys first. Use additive v2 procedures.

### Compatibility rule

1. Add `v2` routers under the existing store, admin, and bot roots.
2. New v2 procedures return serialized Results for expected failures.
3. Existing procedures call the same new operation, then use a legacy adapter:
   - `Ok` returns the old DTO;
   - expected `Err` maps to the old tRPC code/message;
   - unknown failures still throw.
4. Deploy server support first.
5. Move storefront, admin, and agent callers to v2 one workflow at a time.
6. Observe one full soak window.
7. Delete legacy procedures and adapters only after all first-party consumers and probes use v2.

Do not run legacy and v2 side-effect implementations in parallel. Both routes must call one operation.

### Deployment order per phase

1. Server/API with old and new procedures.
2. Storefront.
3. Admin.
4. Agent.
5. Legacy removal after soak.

Database migrations must be additive. Emergency rollback uses the previous Worker version; do not down-migrate during an incident.

## Required reliability corrections before truthful error copy

Better Result does not make side effects safe. Complete these corrections as part of the relevant workflow migration.

### Checkout idempotency

Before converting `addOrder`:

1. Add an optional checkout idempotency key to the shared input schema.
2. Add an additive database table or unique record with key hash, normalized request hash, order ID, and payment ID.
3. Generate and retain one key per unchanged checkout attempt in storefront and assistant/agent.
4. Same key plus same request replays the committed result.
5. Same key plus different request returns `CheckoutKeyConflict`.
6. Make the key required only after both clients have deployed.

This resolves the current uncertain-response duplicate risk and the assistant’s permanent `creating` state in `packages/assistant/src/checkout.ts:229-233` and `checkout-tools.ts:259-302`.

### Payment commit state

Once payment confirmation commits, cache purge or notification failure must not turn the public outcome into “payment failed.” In `packages/api/src/lib/payments/transfer-confirmation.ts`, classify:

- payment/stock transaction: committed or not committed;
- cache purge: completed or queued for retry;
- customer/admin notification: completed, persisted for retry, or ambiguous;
- analytics: best effort.

Return public success after the payment commit. Persist failed recoverable side effects.

### QPay partial success

Model provider invoice creation separately from local DB and KV persistence. Retry with the stable provider request identity. Never create a second invoice merely because the response or local cache write was lost.

### Accurate read failures

Stop turning infrastructure failure into valid-looking business data:

- product search failure must not become `[]`;
- analytics failure must not become `0`;
- profile order failure must not become “no orders”;
- auth lookup failure must not become “signed out” unless the session is genuinely absent.

## Implementation phases

Each phase must be a separate logical PR or an independently revertible commit series. Do not begin a later high-risk phase while an earlier contract phase is unstable.

### Phase 0: Establish a trustworthy baseline

**Work**

- Create a clean worktree under `~/dev/scratchpad`; do not implement in the currently dirty main worktree.
- Re-run the drift inventory against the current chosen base commit.
- Align tRPC versions before freezing transport contracts.
- Make `bun run check-types` green or document and isolate verified pre-existing failures.
- Add root `test` and focused `test:contract` commands using Bun’s test runner.
- Record current tRPC, REST, webhook, and UI error behavior in tests before changing it.

**Gate**

- `bun run check-types`
- existing `apps/server/src/lib/trpc-error-log.test.ts` passes;
- root test command exists and exits 0;
- no runtime behavior changed.

### Phase 1: Add dependency and result foundation

**Work**

- Install and pin `better-result@2.10.0` and `dismatch@2.6.0` in direct-importing workspaces.
- Add shared result-envelope validation and round-trip tests.
- Add public error contract conventions and exhaustive dismatch helpers for plain `_tag` unions. Keep `assertNever` only for two-case or library-incompatible boundaries.
- Add central projection for logs that emits tags and safe metadata only.
- Add a legacy Result-to-TRPC adapter and provider-specific Result-to-HTTP adapters.

**Gate**

- JSON, SuperJSON, batch tRPC, and malformed-envelope tests pass;
- raw TaggedError serialization is rejected by tests;
- no procedure output changed.

### Phase 2: Add v2 transport skeleton

**Work**

- Add nested `v2` store, admin, and bot routers.
- Add Solid Query and React Query result helpers.
- Add generic unexpected-error presentation with retry, safe exit, and correlation ID.
- Keep legacy routes as wrappers around the same operation.

**Gate**

- old and v2 routes coexist;
- old success and error shapes remain byte/semantically compatible;
- v2 expected Err is TanStack data, while malformed or unexpected failure is TanStack error.

### Phase 3: Checkout and order creation

**Work**

- Add idempotency schema and persistence prerequisite.
- Add `CheckoutError` contracts/factories and checkout operation.
- Convert storefront checkout and assistant checkout tools.
- Add cart correction, stock quantity, recovery, and safe retry UI.
- Keep notification and QPay precreation as explicitly classified post-commit work.

**Gate**

- empty cart, missing product, changed stock, invalid details, response loss after commit, same-key replay, changed-request conflict, session failure after commit, and notification failure tests pass;
- repeated checkout creates one order/payment;
- cart is cleared only on `Ok`.

### Phase 4: Payments and reconciliation

**Work**

- Convert transfer claim, notification, payment-method selection, QR creation, QPay check, admin confirmation, and DO reconciliation.
- Replace `KhaanTransactionAlreadyConsumedError` at the public operation boundary with a safe tag.
- Preserve internal sensitive fingerprint logging rules.
- Separate committed payment success from cache/notification/analytics outcomes.
- Preserve webhook acknowledgment behavior.

**Gate**

- simultaneous admin/QPay/DO confirmation tests pass;
- same and different Khaan fingerprint behavior passes;
- provider ambiguity does not create a false failure or duplicate invoice;
- no provider body or fingerprint reaches a public payload;
- post-commit side-effect failure remains public success with queued recovery.

### Phase 5: Product, stock, search, and restock

**Work**

- Replace `applyStockTransition` null sentinel with `Result` and `StockTransitionError`.
- Convert product-not-found, unavailable, stock, search, and restock subscription outcomes.
- Preserve restock lease and ambiguous SMS state machine.
- Add explicit storefront query-error states for products, filters, and restock.

**Gate**

- no search outage renders as an empty result set;
- all stock callers handle every transition tag;
- duplicate subscription remains idempotent success;
- rate-limit UI includes retry timing where available.

### Phase 6: Admin catalog, orders, purchases, and batches

**Work**

- Convert product, brand, category, customer, image, product-image, order, payment-review, purchase, sales, and analytics boundaries.
- Keep pure analytics outages as transport failures rather than `Result.err` business outcomes.
- Delete exact message comparisons.
- Aggregate batch failures into one typed result and one presentation.
- Remove raw `error.message` from admin toasts and production error pages.

**Gate**

- every purchase rule has a contract test and exhaustive UI mapping;
- stock rollback cannot fail silently;
- batch operations produce one summary, not toast storms;
- production admin UI never renders stack, cause, provider body, or raw exception text.

### Phase 7: AI, uploads, and provider adapters

**Work**

- Convert Firecrawl/model extraction, image resolution, upload validation, remote fetch, transform, and R2 persistence.
- Validate all provider `unknown` payloads before returning `Ok`.
- Preserve partial success for multi-image operations.
- Map provider outages to safe retry metadata.

**Gate**

- malformed provider responses are unexpected/adapter failures, not trusted domain values;
- partial uploads report exact successful and failed items;
- no provider response text reaches customer/admin copy.

### Phase 8: Assistant, agent, Messenger, and background jobs

**Work**

- Replace assistant open-string failures with closed tags.
- Convert cart/checkout session storage, Messenger send outcomes, image staging, admission/dedupe, scheduled jobs, payment outbox, and restock dispatch boundaries.
- Keep DO/KV/R2 state and Flue tool contracts as plain validated DTOs.
- Map internal Result outcomes to provider retry/ack semantics explicitly.

**Gate**

- duplicate Messenger inbound delivery is not dispatched twice;
- pre-commit failures release retry claims;
- post-commit notification failure does not repeat the commerce commit;
- ambiguous delivery remains distinct from retryable and permanent failure;
- Flue build and existing Messenger proofs pass.

### Phase 9: UI copy and error-state completion

**Work**

- Complete exhaustive presentation maps for all public unions.
- Add missing payment-polling, profile-history, auth-check, copy-to-clipboard, filter, and query error states.
- Ensure each critical message states what happened, state impact/reassurance, recovery, and a safe exit or escalation route.
- Add a support/contact destination before telling users to contact support.

**Gate**

- no `toast.error(error.message)` or equivalent raw rendering remains;
- no infrastructure failure renders as “empty,” “zero,” “signed out,” or “not found”;
- every retry action retries the failed operation, not every cached query globally;
- storefront and admin copy is Mongolian except intentional operator-only diagnostics.

### Phase 10: Remove legacy paths and enforce the model

**Work**

- Confirm all first-party clients use v2 procedures.
- Remove legacy procedures, adapters, duplicated catch wrappers, and obsolete custom error classes.
- Keep genuine invariants and framework throws.
- Add CI checks for banned patterns in production runtime.
- Document the error-model convention in `CONTEXT.md` or an ADR.

**Gate**

- seven-day soak has no wire-shape regression or unexpected panic increase;
- no expected business rule is represented only by an exception message;
- no production `.unwrap()` use;
- no public TaggedError serialization;
- no raw provider or exception message reaches UI;
- old procedures have zero observed first-party traffic before removal.

## Test plan

The repository currently has only one checked-in test. This migration must add tests before changing high-risk behavior.

### Contract tests

- Every `_tag` variant accepts its intended payload and rejects malformed or extra sensitive fields.
- Every serialized result round-trips through JSON and SuperJSON.
- Every malformed envelope or malformed nested payload becomes a transport error.
- Batch tRPC responses preserve independent Result values.

### Adapter tests

- Every public tag maps to its expected legacy tRPC code during compatibility.
- Internal errors map to sanitized 500 responses.
- QPay, SMS, Messenger, Firecrawl, upload, and search adapters classify timeout, malformed response, rejection, and ambiguous acceptance separately.
- Webhook HTTP tests preserve provider retry semantics.

### Domain and concurrency tests

- checkout idempotency, request hash mismatch, response loss, and concurrent insert;
- payment confirmation races, stock transaction rollback, and replay;
- Khaan transaction fingerprint ownership;
- QPay invoice local-persistence failure after provider success;
- notification/outbox lease ownership and stale lease recovery;
- restock lease and ambiguous SMS outcome;
- Messenger inbound dedupe and claim release.

### UI mapping tests

Presentation mappers must be pure functions and tested exhaustively. Verify:

- title and description are not empty;
- state impact/reassurance exists for checkout/payment partial-success risks;
- actions match recovery metadata;
- no raw technical message is included;
- new union variants fail type checking until mapped.

### Required commands at the end of every implementation phase

Run the focused tests first, then:

```sh
bun run check-types
bun run check
bun run lint
bun run format
bun run build
bun run knip
```

Run agent-specific builds/proofs when agent code changes. Run staging browser/API/payment/Messenger proofs only with safe non-production configuration and disposable data.

## Observability

Expected `Err` values are not operator errors by default. Log them at an appropriate level with:

- `error_tag`
- `operation`
- `error_layer`
- `retryable`
- `attempt`
- `commit_state`
- `partial_success`
- `idempotency_outcome`
- provider name when safe

Unexpected failures include `panic: true` or an equivalent defect marker and a correlation ID. Never log public localized copy as the error identifier. Never emit phone, address, token, provider body, fingerprint, or credentials in the new projection.

## Rollout and rollback

- Keep each PR wire-compatible and independently revertible.
- Deploy server support before clients.
- Do not run old and new side-effect implementations in parallel.
- Shadow only pure classification and mapping code.
- Use additive database migrations.
- Roll back Worker versions before considering code or data rollback.
- Keep compatibility adapters for at least one full soak window.
- Compare tRPC/HTTP code distribution, expected error tags, panic count, duplicate-order count, payment retry rate, and partial-success recovery before advancing.

## Done criteria

- [ ] All production expected business failures have a closed operation-specific union.
- [ ] Expected failures cross first-party RPC boundaries as validated serialized Results.
- [ ] Unexpected failures remain thrown, centrally logged, sanitized, and visible as transport errors.
- [ ] No string comparison decides error identity.
- [ ] No ambiguous `null`, empty array, zero, or false sentinel hides an expected failure or infrastructure outage.
- [ ] Storefront, admin, assistant, agent, server, and API use exhaustive dismatch for every discriminated branch with three or more variants.
- [ ] Storefront, admin, assistant, and agent handle their consumed unions exhaustively.
- [ ] Checkout and payment retries are idempotent and partial-success states are truthful.
- [ ] Webhook status behavior remains provider-correct.
- [ ] Public errors contain no stack, cause, provider body, fingerprint, token, or private customer data.
- [ ] Critical user messages explain what happened, state impact, recovery, and a way out.
- [ ] All static checks, tests, builds, and safe staging proofs pass.
- [ ] Legacy procedures are removed only after confirmed zero first-party usage.
- [ ] An ADR documents the final expected-versus-unexpected error policy.

## STOP conditions

Stop and ask the owner if:

- a domain outcome cannot be classified without a product decision;
- truthful reassurance depends on unknown commit or idempotency behavior;
- a provider’s retry/ack contract is not verified;
- implementation requires sending a class instance, stack, cause, or provider response over a public boundary;
- a migration would require lockstep server/client deployment;
- a database change cannot be additive and rollback-safe;
- the existing payment, order, Messenger, or restock state machine differs from this plan;
- a verification fails twice after one reasonable correction;
- work would overwrite or mix with the current dirty worktree.

## Source references

### Better Result

- Repository: https://github.com/dmmulroy/better-result
- Version and ESM exports: https://github.com/dmmulroy/better-result/blob/0d1d792f4e409cf08cbee1a10a64ec951636577f/package.json#L2-L37
- Result constructors and type guards: https://github.com/dmmulroy/better-result/blob/0d1d792f4e409cf08cbee1a10a64ec951636577f/src/core.ts#L798-L832
- Async `tryPromise` and retries: https://github.com/dmmulroy/better-result/blob/0d1d792f4e409cf08cbee1a10a64ec951636577f/src/result.ts#L91-L173
- Serialization and shallow deserialization: https://github.com/dmmulroy/better-result/blob/0d1d792f4e409cf08cbee1a10a64ec951636577f/src/result.ts#L433-L470
- Tagged error serialization risk: https://github.com/dmmulroy/better-result/blob/0d1d792f4e409cf08cbee1a10a64ec951636577f/src/error.ts#L85-L93
- Panic behavior: https://github.com/dmmulroy/better-result/blob/0d1d792f4e409cf08cbee1a10a64ec951636577f/src/core.ts#L65-L81

### dismatch

- Repository: https://github.com/amir-gorji/dismatch
- Documentation: https://dismatch.dev/docs/
- Version and exports: `/home/darjs/.btca/agent/sandbox/dismatch/package.json`
- Exhaustive synchronous matcher: `/home/darjs/.btca/agent/sandbox/dismatch/src/unions.ts:335`
- Exhaustive asynchronous matcher: `/home/darjs/.btca/agent/sandbox/dismatch/src/async.ts:37`

### Store Kit local reference

- `/home/darjs/dev/store-kit/packages/contracts/src/checkout.ts`
- `/home/darjs/dev/store-kit/packages/commerce/src/errors/checkout.ts`
- `/home/darjs/dev/store-kit/packages/commerce/src/checkout/operations.ts`
- `/home/darjs/dev/store-kit/packages/api/src/routes/shopping.ts`
- `/home/darjs/dev/store-kit/packages/storefront/src/query-options/result.ts`
- `/home/darjs/dev/store-kit/packages/storefront/src/checkout.tsx`

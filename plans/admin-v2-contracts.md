# Admin V1 API contract and data audit

Owner: Track 0 (API lead). Status: committed for the V2 rewrite.

Scope: the procedures under `packages/api/src/routers/admin/` that the V2 screens
(Home, Products, Orders, Analytics) consume, their request/response shapes, the
domain-error shapes per domain, the order-status transition rules, and the
analytics cache scheme. The Messenger bot router (`bot.ts`) is WIP and out of
scope. No `admin.v1` namespace was added — existing procedures were fixed in
place, per domain.

## How to read this document

- Every procedure lists its tRPC type (query/mutation), input schema, and the
  shape of a successful response.
- `V2` marks procedures the V2 screens use directly. Everything else is kept
  for the legacy admin and the Messenger assistant and will be reviewed for
  deletion after cutover.
- Errors: transport errors are tRPC `INTERNAL_SERVER_ERROR` (server/database
  failures). Expected conflicts return typed domain errors (see per-domain
  tables). Validation failures return `BAD_REQUEST` with a valibot message.
  The production error formatter sanitizes `INTERNAL_SERVER_ERROR` messages to
  a generic string, so writers must reject expected-conflict inputs with
  explicit `BAD_REQUEST`/`NOT_FOUND` codes instead of letting them 500.

---

## 1. Auth (`admin/auth` → `auth`)

| Procedure | Type | Input | Output |
| --- | --- | --- | --- |
| `me` | query | — | session payload, or null |
| `logout` | mutation | — | `{ success: true }` |
| `createUser` | mutation | `{ googleId, username, isApproved }` | user record |
| `getUserFromGoogleId` | query | `{ googleId }` | user record or null |

V2: `me` + `logout` only (the shell reuses the existing session boundary).
Errors: `UNAUTHORIZED` when no admin session; `NOT_FOUND`/`INTERNAL_SERVER_ERROR`
for the user procedures.

## 2. Products (`admin/product`)

Inputs for `addProduct`/`updateProduct` use `addProductSchema` /
`updateProductSchema` from `@vit/shared/schema`:
`{ name, description, dailyIntake, brandId (string, parsed to int), categoryId
(string, parsed to int), amount, potency, status, stock, price, images:
[{url, id?}], name_mn?, ingredients?, tags?, seoTitle?, seoDescription?,
weightGrams?, expirationDate? }`.

| Procedure | Type | Input | Output |
| --- | --- | --- | --- |
| `searchProductByName` | query | `{ searchTerm }` | products (limit 3) |
| `searchProductsInstant` | query | `{ query, limit?, brandId?, categoryId?, status? }` | `[{ id, name, slug, price, stock, status, images: [{url}] }]` |
| `addProduct` | mutation | `addProductSchema` | `{ message, id, product }` — `product` is the authoritative saved entity (full detail incl. images/category/brand, `updatedAt`) |
| `updateProduct` | mutation | `updateProductSchema` | `{ message, product }` (authoritative entity) |
| `updateStock` | mutation | `{ productId, numberToUpdate, type: "add"\|"minus" }` | `{ message }` |
| `setProductStock` | mutation | `{ id, newStock }` | `{ message }` |
| `updateProductField` | mutation | `{ id, field, stringValue?, numberValue? }` | `{ message }` |
| `deleteProduct` | mutation | `{ id }` | `{ message }` (soft delete) |
| `getProductById` | query | `{ id }` | product detail (images, category, brand) or `NOT_FOUND` |
| `getAllProducts` | query | — | all non-deleted products |
| `getPaginatedProducts` | query | `{ page, pageSize?, brandId?, categoryId?, status?, sortField?, sortDirection?, searchTerm? }` | `{ products, pagination }` |
| `getAllProductValue` | query | — | `number` |
| `getReviewProducts` | query | — | products needing review |
| `getProductBenchmark` | query | — | `number` (ms) |
| `getRestockWaitCount` | query | `{ productId }` | `{ productId, waitCount }` |
| `listRestockWaitlist` | query | `{ limit? }` | waitlist entries |

V2: `addProduct`, `updateProduct`, `updateStock`, `setProductStock`,
`deleteProduct`, `getProductById`, `getPaginatedProducts`,
`searchProductsInstant`, `getRestockWaitCount`. The others are legacy/assistant.

### Product domain errors

| Condition | Code | Message |
| --- | --- | --- |
| Brand id unknown | `NOT_FOUND` | `Brand not found` |
| Composed name > 256 chars | `BAD_REQUEST` | `Product name exceeds 256 characters` |
| Composed slug > 256 chars | `BAD_REQUEST` | `Product slug exceeds 256 characters` |
| Invalid image URL | `BAD_REQUEST` | `Invalid image URL: …` / `Invalid image URL` |
| amount > 128 / potency > 128 chars | `BAD_REQUEST` | valibot message (Mongolian) |
| DB/server failure | `INTERNAL_SERVER_ERROR` | generic sanitized message |

### P0 fix — product create silent 500 (root cause)

`addProduct` composed `productName = brand.name + name + potency + amount` and
inserted it into `name varchar(256)` (slug same). `amount`/`potency` had no
upper bound in the schema, so a long-but-valid-looking input overflowed the
column, the DB threw, and the production error sanitizer stripped the message —
an opaque HTTP 500 with no usable error ("silent 500"). Fixes:

1. `@vit/shared/schema`: `amount`/`potency` now `maxLength(128)`.
2. `product.ts`: `composeProductIdentity()` guards the composed name and slug
   lengths with typed `BAD_REQUEST` **before** the insert.
3. `addProduct`/`updateProduct` now return the authoritative saved entity.

Evidence (real DB, via `/trpc/bot/product.addProduct` — same resolver as admin):
create → 200 with `{message, id, product}`; read back by id → 200 (fields
match); delete → 200; read after delete → 404. Overflow input → 400
`Product name exceeds 256 characters`. Long potency → 400 Mongolian valibot
message. TEST rows created for verification were removed.

### Related fix — connection leak / connection exhaustion 500s

`db()` (and `createDb`) created a fresh postgres-js client (pool up to 5
sockets) per call and never closed it. Under load this exhausted the
database's connection budget and surfaced as random `INTERNAL_SERVER_ERROR`s
on writes (the same "no error" 500 symptom). `db/client.ts` and `db/index.ts`
now keep a lazy per-isolate singleton pool with `idle_timeout: 20`,
`connect_timeout: 10`, `max_lifetime: 300`, `max: 2` so stale/cloud-killed
sockets are reaped before the next query and a direct connection stays a
modest consumer of the shared budget. Hyperdrive (prod) multiplexes this pool
as before.

## 3. Orders (`admin/order`)

| Procedure | Type | Input | Output |
| --- | --- | --- | --- |
| `addOrder` | mutation | `addOrderSchema` | `{ message }` |
| `updateOrder` | mutation | `updateOrderSchema` | `{ message }` |
| `patchOrderHeader` | mutation | `patchOrderHeaderSchema` | `{ message }` |
| `deleteOrder` | mutation | `{ id }` | `{ message }` (soft delete) |
| `restoreOrder` | mutation | `{ id }` | `{ message }` |
| `shipOrder` | mutation | `{ orderId, addressZoneId }` | `{ orderId, orderNumber, documentNo, deliveryOrderId }` |
| `updateOrderStatus` | mutation | `{ id, status: pending\|shipped\|delivered\|cancelled\|refunded }` | `{ message }` |
| `searchOrder` | mutation | `{ searchTerm }` | shaped orders |
| `searchOrderQuick` | query | `{ query, limit? }` | shaped orders |
| `getAllOrders` | query | — | shaped orders |
| `getOrderById` | query | `{ id: number }` | shaped order detail or `NOT_FOUND` |
| `getOrderIdByOrderNumber` | query | `{ orderNumber }` | numeric id or `null` |
| `getPaginatedOrders` | query | `{ page, pageSize?, paymentStatus?, includeAllStatuses?, orderStatus?, orderStatuses?, sortField?, sortDirection?, searchTerm?, date? }` | `{ orders, pagination }` |
| `getOrderCount` | query | `{ timeRange }` | `{ count }` |
| `getPendingOrders` | query | — | shaped pending orders |
| `getRecentOrdersByProductId` | query | `{ productId }` | orders |
| `getDeliveryAddressZones` | query | — | delivery zones |

Order detail shape (`shapeOrderResult`): `{ id, orderNumber, customerPhone,
status, total, notes, createdAt, address, addressZoneId?, updatedAt,
products: [{quantity, name, price, productId, imageUrl}], deliveryProvider,
paymentStatus, paymentProvider, paymentNumber }`.

V2: `getOrderById` (via `getOrderIdByOrderNumber`), `getPaginatedOrders`,
`getPendingOrders`, `updateOrderStatus`, `shipOrder`, `getDeliveryAddressZones`,
`deleteOrder`, `updateOrder`, `patchOrderHeader`, `addOrder`.

### Order detail ID handling (2b)

Order codes are 8-char alphanumeric (e.g. `Y5WDHJC0`); numeric ids are the DB
auto-increment integers. The lookup path is:

```
orderNumber (string) → getOrderIdByOrderNumber → numeric id → getOrderById
```

`getOrderIdByOrderNumber` queries by string equality (`orderNumber =
'Y5WDHJC0'`) and never parses the code as a number. The V2 UI must follow the
same two-step resolution and must not `Number()` the route param when it is an
8-char order code. Verified: `getOrderIdByOrderNumber("W1BX7LT1")` → `539`
(no numeric parsing involved).

### Order status transitions (2c) — legal graph

Lifecycle: `created` (unpaid) → `pending` (paid, awaiting shipment) →
`shipped` → `delivered` → `refunded`. Cancellation is allowed until delivery.
`cancelled` and `refunded` are terminal (undelete goes through `restoreOrder`).

| From | To |
| --- | --- |
| `created` | `pending`, `cancelled` |
| `pending` | `shipped`, `cancelled` |
| `shipped` | `delivered`, `cancelled` |
| `delivered` | `refunded` |
| `cancelled`, `refunded` | (none) |

`updateOrderStatus` enforces this map (`canTransitionOrderStatus` in
`routers/admin/order-transition.ts`) and returns `BAD_REQUEST` with a
Mongolian message for illegal transitions; same-status calls are no-ops.
`shipOrder` additionally requires current status `pending` and creates the
delivery before flipping to `shipped`. The full-edit path (`updateOrder`) may
still set any status — it is the admin override. `deleteOrder` soft-deletes
(used as cancel for unpaid orders) and restores stock when the order was paid.

Verified (real DB): created→shipped 400; created→pending 200; pending→delivered
400; pending→cancelled 200; cancelled→shipped 400.

### Order domain errors

| Condition | Code | Message |
| --- | --- | --- |
| Unknown order | `NOT_FOUND` | `Захиалга олдсонгүй` |
| Illegal status transition | `BAD_REQUEST` | `Захиалгын төлөв {from}-аас {to} болж өөрчлөгдөх боломжгүй` |
| Ship a non-pending order | `BAD_REQUEST` | `Зөвхөн хүлээгдэж буй захиалгыг илгээх боломжтой` |
| DB/server failure | `INTERNAL_SERVER_ERROR` | generic sanitized message |

## 4. Analytics (`admin/analytics`)

### DB-backed procedures (admin build uses `adminProcedure` unless noted)

| Procedure | Type | Cached | Output |
| --- | --- | --- | --- |
| `getAnalyticsData(timeRange)` | query | KV | combined snapshot: `{ averageOrderValue, totalProfit, salesByCategory, topBrands, customerLifetimeValue, repeatCustomers, inventoryStatus, lowInventoryProducts, failedPayments, metrics: { totalProducts, lowStockCount, topBrandRevenue, currentProductsValue }, lastUpdated, timeRange }` |
| `getAverageOrderValue(timeRange)` | query | KV | number |
| `getTotalProfit(timeRange)` | query | KV | number |
| `getSalesByCategory(timeRange)` | query | KV | rows |
| `getCustomerLifetimeValue()` | query | KV | `{ averageLifetimeValue, totalCustomers, maxLifetimeValue, minLifetimeValue }` |
| `getRepeatCustomersCount(timeRange)` | query | KV | number |
| `getFailedPayments(timeRange)` | query | KV | `{ count, total }` |
| `getTopBrandsBySales(timeRange)` | query | KV | rows (limit 5) |
| `getCurrentProductsValue()` | query | KV | number |
| `getInventoryStatus()` | query | **not cached** | inventory rows |
| `getLowInventoryProducts()` | query | **not cached** | low-stock rows |
| `getHomePageData(timeRange)` | query | **not cached** | see below |

`getHomePageData` returns the V2 home payload:
`{ pendingOrders, revenue, orderCount: { count }, lowStockProducts, topProducts,
recentOrders }`. `pendingOrders`, `lowStockProducts`, and `recentOrders` are
**never cached** (fresh work queue); `revenue`/`orderCount`/`topProducts` may
come from cache. `recentOrders` is a new `orderQueries.admin.getRecentOrders(8)`
query (shaped cards, newest first).

### PostHog-backed procedures

`getWebAnalytics(timeRange)`, `getConversionFunnel(timeRange)`,
`getTopSearches(timeRange, limit?)`, `getMostViewedProducts(timeRange, limit?)`,
`getProductBehavior(productId, timeRange)`, `getDailyVisitorTrend(timeRange)`.

These call PostHog with **explicit UTC instants of the UB-aligned window**
(`PostHogRange { startIso, endIso }` computed by `getTimeRangeBounds`) instead
of the old `now() - interval N day`, so "daily" means the Asia/Ulaanbaatar
calendar day, not the last 24h in PostHog's own timezone. The previous-period
comparison in `getWebAnalytics` uses the window immediately before the current
one.

### Analytics fabricated-fallback removal (2d)

All fabricated fallbacks are gone:

- Router: `getWebAnalytics`, `getConversionFunnel`, `getTopSearches`,
  `getMostViewedProducts`, `getProductBehavior`, `getDailyVisitorTrend`
  previously returned zero-filled payloads on PostHog failure. They now throw
  `INTERNAL_SERVER_ERROR` with a clear message (e.g. `Web analytics
  unavailable`) — the UI shows an unavailable state.
- `analyticsQueries.admin.getAnalyticsData` no longer `.catch(() => 0)` per
  metric; any DB failure propagates as a typed error.
- `orderQueries.admin.{getPendingOrders, getOrderCount, getOrderCountForWeek}`
  and `salesQueries.admin.{getRevenue, getAnalyticsForHome}` no longer swallow
  DB errors into zero/empty results (these fed Home with fabricated "no
  pending orders"/"zero revenue" states).

Empty results that are genuinely empty (no orders in range, no repeat
customers) still return zero/empty values — that is real data, not fabrication.

### Analytics cache (2e)

Cache keys are built by `createKvCacheKey` in
`packages/api/src/lib/cache/kv-cache-key.ts` and include:

- date range (`timeRange`)
- exact UB-aligned start and end instants (`startIso`, `endIso` from
  `getTimeRangeBounds` — pinned to Asia/Ulaanbaatar midnight so a "daily" entry
  is stable all day and rolls over at UB midnight)
- business timezone (`asia/ulaanbaatar`)
- schema version (`v1` — bump to invalidate every cached analytics entry)

TTLs (`getTtlForTimeRange`): daily 5 min, weekly 15 min, monthly 30 min
(per the rewrite plan).

Purge: `purgeAnalyticsCache(ctx)` deletes every live analytics key for the
current UB day. It runs after product writes (`addProduct`, `updateProduct`,
`updateStock`, `setProductStock`, `deleteProduct`, `updateProductField`) and
order writes (`addOrder`, `updateOrder`, `patchOrderHeader`, `deleteOrder`,
`restoreOrder`, `updateOrderStatus`, `shipOrder`) in the admin routers.
Payment writes (admin `payment` router, transfer confirmation) are wired to
storefront catalog purge already; analytics purge for payment-only writes is a
documented follow-up for the integrator (payment router is not in Track 0's
owned files).

Not cached (per plan policy): pending orders, order detail, order status,
product detail, inventory, payment state, mutation responses.
`getInventoryStatus`, `getLowInventoryProducts`, and `getHomePageData` were
moved off the cached procedure; they are read-heavy home/inventory surfaces
and must stay fresh. The legacy KV cache middleware remains only for the
historical-analytics procedures listed above and will be replaced by the V2
cache layer (Track 2/6).

## 5. Storefront consumers check

The Messenger assistant (`packages/assistant`, WIP per plan) calls the admin
procedures through `safeProvider`, which converts rejections into error
strings for the model — the analytics fallback removal surfaces PostHog/DB
failures to the agent instead of fake zeros, which is the intended behavior.
No storefront consumer reads these admin procedures' responses.

## 6. V2 screen → procedure map

| Screen | Procedures |
| --- | --- |
| Home | `analytics.getHomePageData`, `order.getPendingOrders` |
| Products | `product.getPaginatedProducts`, `product.searchProductsInstant`, `product.getProductById`, `product.addProduct`, `product.updateProduct`, `product.updateStock`, `product.setProductStock`, `product.deleteProduct`, `product.getRestockWaitCount` |
| Orders | `order.getPaginatedOrders`, `order.getOrderIdByOrderNumber`, `order.getOrderById`, `order.updateOrderStatus`, `order.shipOrder`, `order.getDeliveryAddressZones`, `order.updateOrder`, `order.patchOrderHeader`, `order.deleteOrder` |
| Analytics | `analytics.getAnalyticsData`, `analytics.getAverageOrderValue`, `analytics.getTotalProfit`, `analytics.getSalesByCategory`, `analytics.getTopBrandsBySales`, `analytics.getRepeatCustomersCount`, `analytics.getFailedPayments`, `analytics.getCurrentProductsValue`, PostHog procedures (`getWebAnalytics`, `getConversionFunnel`, `getTopSearches`, `getMostViewedProducts`, `getDailyVisitorTrend`) |

## 7. Files changed (Track 0)

- `packages/shared/src/schema.ts` — amount/potency maxLength(128)
- `packages/api/src/db/client.ts`, `packages/api/src/db/index.ts` — lazy
  singleton pools + connection lifecycle options
- `packages/api/src/routers/admin/product.ts` — length guard, entity returns,
  analytics purge
- `packages/api/src/routers/admin/order.ts` — status transition guard,
  analytics purge
- `packages/api/src/routers/admin/order-transition.ts` — `ORDER_STATUS_TRANSITIONS`
- `packages/api/src/routers/admin/analytics.ts` — UB ranges, typed errors,
  uncached home/inventory, extended `getHomePageData`
- `packages/api/src/queries/analytics.ts` — remove fabricated fallbacks
- `packages/api/src/queries/orders.ts` — remove fabricated fallbacks, add
  `getRecentOrders`
- `packages/api/src/queries/sales.ts` — remove fabricated fallbacks
- `packages/api/src/lib/cache/kv-cache-key.ts` — versioned UB-aware keys +
  `purgeAnalyticsCache`
- `packages/api/src/lib/utils.ts` — `getTimeRangeBounds`, TTLs per plan
- `packages/api/src/lib/integrations/posthog/client.ts` + `index.ts` —
  explicit range-based queries, `PostHogRange` type
- `apps/server/src/lib/logging.ts` — evlog/hono boundary cast (pre-existing
  type error)
- `apps/server/alchemy.run.ts` — export `StorefrontCacheRpc` (pre-existing
  declaration-name error)

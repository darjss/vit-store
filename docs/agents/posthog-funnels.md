# PostHog funnels

Read this before answering "show me the funnel" or any sales, conversion or attribution question. PostHog project `262338` (US cloud) holds storefront and server events for https://amerikvitamin.mn. The production database is still the money ledger. PostHog is for conversion and attribution.

## Funnel spine

| Step | Event               | Fired by                                                                                           | Properties to use                                                                                                                                                                                                                               |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `$pageview`         | posthog-js, `apps/storev2/src/components/posthog.astro`, plus `astro:after-swap` in `Layout.astro` | `$host`, `$pathname`, `utm_*`, `fbclid`, `$referring_domain`                                                                                                                                                                                    |
| 2    | `product_viewed`    | browser, `apps/storev2/src/pages/products/[slug].astro`                                            | `product_id` (number), `product_price`, `product_slug`                                                                                                                                                                                          |
| 3    | `add_to_cart`       | browser, `src/store/cart.tsx` via `src/lib/analytics.ts`                                           | `product_id`, `price`, `quantity`, `source` (`home`, `product`, `catalog`, `search`)                                                                                                                                                            |
| 4    | `checkout_started`  | browser, `checkout-form.tsx`, once per cart per tab session                                        | `cart_total`, `item_count`, `product_ids`                                                                                                                                                                                                       |
| 5    | `order_created`     | server, `packages/api` store `addOrder` and admin `addOrder`                                       | `order_number`, `payment_number`, `order_value`, `currency`, `num_items`, `product_ids`, `content_ids`, `products`, `source` (`web`, `messenger`, `admin`). No `$revenue`.                                                                      |
| 6    | `payment_confirmed` | server, every confirm path (`transfer-confirmation.ts`) and admin payment edits                    | `$revenue` (MNT), `currency`, `provider` (`qpay`, `transfer`), `confirmation_source` (`qpay_checkout`, `qpay_webhook`, `auto_reconciliation`, `messenger`, `admin`), `order_number`, `payment_number`, `product_ids`, `content_ids`, `products` |

`content_ids` is the product id as a string, the same value the Meta Pixel sends. Browser events use the numeric `product_id`. Only `payment_confirmed` carries `$revenue`, one event per successful Payment.

Other events worth knowing: `search_performed`, `search_result_clicked`, `cart_opened`, `remove_from_cart`, `bank_deeplink_clicked|app_opened|no_handoff`, `payment_recovery_sheet_shown|chosen`, `qpay_invoice_created|failed` (server), `restock_*`, `$exception`.

## Identity

- The browser is anonymous until checkout or OTP login. `identifyUser(phone)` sets the distinct id to the SHA-256 hex of the 8-digit phone. Checkout awaits it before `addOrder`.
- Server events use the same SHA-256 of the phone, so `order_created` and `payment_confirmed` land on the browser person after the merge.
- posthog-js runs with `person_profiles: identified_only`, so the `persons` table only has people who checked out or logged in. Funnels by `person_id` still work for anonymous visitors.
- Messenger and admin orders use the same phone hash. They have no web history unless that phone also checked out on the site.
- A browser that is already identified as one phone and checks out with another stays split. PostHog refuses that merge.

## Attribution

- posthog-js puts `utm_*`, `fbclid` and `$referring_domain` on every browser event, and `$initial_*` on the person at identify. Server events have no `$session_id`.
- To split the funnel by traffic source, break down on step 1 properties (`$referring_domain`, `utm_source`), or on the person's `$initial_referring_domain` / `$initial_utm_source`.
- Meta ad clicks arrive with `fbclid` but no UTM tags. Add URL parameters in Ads Manager (`utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}`) to split campaigns.
- `utm_source=chatgpt.com` was 40% of pageviews in the 30 days to 2026-11-10: real Mongolian mobile users, `$direct` referrer, no `fbclid`. Some link the owner shares was probably copied out of ChatGPT. Treat it as one unknown channel until someone finds that link.

## Querying through Executor

Use the read-only `scopedRead` tool. It needs no approval. `mcp.exec` on the same app asks for approval on every call.

```js
// mcp__executor__execute
const R = tools["posthog-vit-store-analytics"].scopedRead;
const accountId = "acc_5406cf06-bca2-4cc7-8962-8fcbb521ec1b";
const run = (command) => R({ accountId, input: { command } });
await run("call execute-sql " + JSON.stringify({ query: "SELECT 1" }));
await run("call query-funnel " + JSON.stringify(funnelQuery));
await run("call read-data-schema " + JSON.stringify({ query: { kind: "events" } }));
await run("info query-funnel");
```

The result text is in `result.result`, pipe-separated.

Funnel in HogQL, ordered, 7-day window per person:

```sql
SELECT countIf(step >= 1) AS visitors, countIf(step >= 2) AS viewed_product,
  countIf(step >= 3) AS added_to_cart, countIf(step >= 4) AS started_checkout,
  countIf(step >= 5) AS created_order, countIf(step >= 6) AS paid
FROM (
  SELECT person_id, windowFunnel(86400 * 7)(toDateTime(timestamp),
    event = '$pageview', event = 'product_viewed', event = 'add_to_cart',
    event = 'checkout_started', event = 'order_created', event = 'payment_confirmed') AS step
  FROM events
  WHERE timestamp > now() - interval 30 day
    AND event IN ('$pageview', 'product_viewed', 'add_to_cart', 'checkout_started', 'order_created', 'payment_confirmed')
    AND (event != '$pageview' OR properties.$host = 'amerikvitamin.mn')
  GROUP BY person_id
)
```

The typed version is `call query-funnel` with `{"kind":"FunnelsQuery","series":[{"kind":"EventsNode","event":"$pageview"}, ...],"dateRange":{"date_from":"-30d"},"funnelsFilter":{"funnelWindowInterval":7,"funnelWindowIntervalUnit":"day"}}`. Add `"breakdownFilter":{"breakdown":"$referring_domain","breakdown_type":"event"}` to split by source.

Paid orders and revenue by order source:

```sql
SELECT coalesce(o.source, 'unknown') AS source, count() AS paid, sum(p.revenue) AS revenue_mnt
FROM (
  SELECT properties.order_number AS order_number, toFloat(properties.$revenue) AS revenue
  FROM events WHERE event = 'payment_confirmed' AND timestamp > now() - interval 30 day
) AS p
LEFT JOIN (
  SELECT properties.order_number AS order_number, any(properties.source) AS source
  FROM events WHERE event = 'order_created' GROUP BY order_number
) AS o ON o.order_number = p.order_number
GROUP BY source ORDER BY revenue_mnt DESC
```

## Caveats

- `payment_confirmed` is unreliable before the deploy of the PR that added this doc. From 2026-07-08 (`6820c85`) the capture was fire-and-forget, and the Worker cancelled it once the response went out. QPay confirmations (store check and webhook) were lost. Transfers confirmed inside the reconciler Durable Object mostly survived. In the 30 days to 2026-11-10 the database had 20 paid Payments for 3,635,000 MNT, and PostHog had 2. Use the database (`vit-playground/scripts/revenue-report.ts`) for revenue before the cutoff. `qpay_invoice_created` had the same bug and shows 0 since October.
- Older `order_created` events carry `$revenue` and `item_count` and have no `source`. `order_placed` is gone. It only exists in history and duplicated `payment_confirmed`.
- Staging sends to the same project, about 2 pageviews a month. Filter `properties.$host = 'amerikvitamin.mn'`.
- Bots: posthog-js drops known bot user agents. In the 30 days to 2026-11-10 there were no headless or bot UAs, 96% of pageviews were from MN, and 53 were from the US.
- About 1% of `$pageview` are duplicates within 2 seconds in the same session (initial load plus `astro:after-swap`). Counts of unique persons are not affected.
- PostHog has no warehouse tables. Ad spend and the database ledger are not queryable here. Orders admins take by hand on the main Messenger page only show up if someone enters them in the admin.

## Funnel numbers at audit (2026-11-10, ordered funnel, unique persons)

| Window | Visitors | Product view | Add to cart | Checkout | Order | Paid (PostHog) | Paid (DB) |
| ------ | -------: | -----------: | ----------: | -------: | ----: | -------------: | --------: |
| 7d     |      108 |           69 |          16 |       11 |     4 |              0 |         6 |
| 30d    |      375 |          224 |          67 |       37 |    18 |              0 |        20 |

DB orders in those windows: 6 (7d) and 26 (30d). PostHog had an `order_created` for every one of them.

## What changed in the PR that added this doc

- Server captures go through `waitUntil` from `cloudflare:workers`, so they survive the response.
- `payment_confirmed` gets `confirmation_source`, `content_ids` and `products` with prices. It also fires for admin order create with paid status, admin order edit to paid, and admin manual payment create.
- `order_created` fires for admin orders too and carries `source`, items and `content_ids`. `$revenue` moved to `order_value`.
- The Messenger bot's store client sends `X-Vit-Client: messenger`, so its orders get `source: messenger`.
- `order_placed` and the unused `identifyUserServerSide` are removed.
- Checkout awaits `identify` before creating the order. Before, 3 of 26 web orders in 30 days never stitched to their browser history.

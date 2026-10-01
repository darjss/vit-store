---
name: store-analytics
description: >-
  Store-analytics pulse covering revenue, orders, web traffic and the checkout
  funnel. Use when the admin asks борлуулалт / revenue / today, week or month
  stats, visitors, funnel, or тайлан.
---

# Store analytics

## Steps

1. Run `sales.analytics()`. It returns `daily`, `weekly` and `monthly`, each with `revenue`, `profit` and `salesCount`.
   Done when the numbers are in hand.

2. Add only the slices the admin asked for:
   - traffic: `analytics.getWebAnalytics({ timeRange })`
   - funnel: `analytics.getConversionFunnel({ timeRange })`
   - top sellers: `sales.topProducts({ timeRange, productCount: 5 })`

   `timeRange` is `"daily"`, `"weekly"` or `"monthly"`. Use `"weekly"` unless the admin said today or month.
   Done when every requested slice is loaded.

3. Deliver a short brief with amounts in ₮.
   Done when the brief is delivered.

Order-level detail goes to skill `lookup-orders`. Shipping goes to skill `named-zone-ship`.

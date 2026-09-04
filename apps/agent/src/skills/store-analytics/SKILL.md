---
name: store-analytics
description: >-
  Store-analytics pulse: revenue, orders, web traffic, checkout funnel. Use when
  the admin asks борлуулалт / revenue / today-week-month stats, web visitors,
  funnel, or тайлан.
---

# Store analytics

## Steps

1. Default pulse: `sales.analytics()` → use `daily` + `weekly` (revenue, profit, salesCount).  
   **Done:** numbers in hand.

2. Branches: web/traffic → `analytics.getWebAnalytics({ timeRange })`; funnel → `analytics.getConversionFunnel({ timeRange })`; top sellers → `sales.topProducts`. Default `timeRange` `weekly` unless they said today/month.  
   **Done:** requested slices loaded.

3. **Deliver** short readable brief.  
   **Done:** brief delivered.

Order line-items → skill `lookup-orders`. Shipping → skill `named-zone-ship`.

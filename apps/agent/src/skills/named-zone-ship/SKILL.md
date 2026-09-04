---
name: named-zone-ship
description: >-
  Named-zone ship for paid pending orders. Use when the admin says ship / илгээ,
  ships the paid set, or picks a delivery zone by location name.
---

# Named zone ship

## Steps

1. Missing zone → `order.suggestZonesForAddress({ address })` → top 2–3 **zoneName**s. **Deliver** choices by location text only.  
   **Done:** admin picked a name (or zone already on order).

2. Map pick → `zoneId` privately (or use existing `addressZoneId`). `order.shipOrder({ orderId, addressZoneId })`. **Deliver** result naming the **zoneName** used.  
   **Done:** shipped or **soft-confirm** waiting on bulk.

Bulk ship-all: **soft-confirm** scope first. Zone id source: suggest / zones list / named pick only.

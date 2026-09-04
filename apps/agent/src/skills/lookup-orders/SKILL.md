---
name: lookup-orders
description: >-
  Order lookup and summaries. Use when the admin asks today’s/pending/paid
  orders, an order number, a phone, or захиалга / төлбөр төлсөн.
---

# Lookup orders

## Steps

1. Targeted read (`order.getPaginatedOrders` / `order.getOrderById` / search) — not a full dump.  
   **Done:** rows in hand.

2. **Deliver** summary (number, phone, total, payment, status, short address); ≤10 + “next”. If paid-ready-to-ship, offer **named zone** ship.  
   **Done:** summary delivered.

Ship hand-off → skill `named-zone-ship`.

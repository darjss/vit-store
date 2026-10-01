---
name: lookup-orders
description: >-
  Order lookup and summaries. Use when the admin asks for today's, pending or
  paid orders, gives an order number or phone, or says захиалга / төлбөр төлсөн.
---

# Lookup orders

## Steps

1. Run the narrowest read that answers the question, and return only the fields step 2 shows:
   - order number or phone: `order.searchOrderQuick({ query })`
   - one order in full: `order.getOrderById({ id })`
   - a list: `order.getPaginatedOrders({ date, orderStatus, paymentStatus, pageSize: 10 })`

   `date` takes `"today"`, `"yesterday"`, `"last7days"`, `"last30days"` or `"YYYY-MM-DD"`, all in Ulaanbaatar time. Paid and waiting to ship is `orderStatus: "pending", paymentStatus: "success"`. A customer who says they sent a bank transfer is `paymentStatus: "customer_claimed_paid"`.
   Done when the rows are in hand.

2. Deliver one line per order: number, phone, total, payment status, order status, short address. Show the first 10 and offer the next page. When paid orders are waiting to ship, offer to ship them (skill `named-zone-ship`).
   Done when the summary is delivered.

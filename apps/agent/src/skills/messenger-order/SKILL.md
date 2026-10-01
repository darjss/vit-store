---
name: messenger-order
description: >-
  Messenger-order from a customer chat screenshot. Use when imageKeys show a
  customer Messenger thread with phone, address or products, or the admin says
  add an order from this screenshot.
---

# Messenger order

## Steps

1. In the same turn, run `extract_order_from_chat_image_keys({ imageKeys })`.
   Done when the extract (phone, address, notes, product lines, `paymentHint`) is in hand.

2. Build the draft order:
   - Match each product line with `product.searchProductsInstant({ query })`. Ask about ambiguous lines only.
   - Look the phone up with `customer.getCustomerByPhone({ phone })`, passing the phone as a number. No customer found means `isNewCustomer: true`.

   Done when every line has a `productId` and the draft passes the addOrder rules below.

3. Deliver the draft, soft-confirm "create this order?", then run `order.addOrder`. Deliver the order number.
   Done when the order exists, or the admin declined.

## addOrder input

- `customerPhone`: 8 digits starting with 6-9, as a string.
- `address`: 10+ characters. `notes` from the chat.
- `status: "created"`.
- `paymentStatus: "pending"`, or `"success"` when the admin says it is paid. `paymentHint` is only a hint; confirm it with the admin.
- `deliveryProvider: "tu-delivery"`, unless the admin says `self`, `avidaa` or `pick-up`.
- `isNewCustomer` from step 2.
- `products: [{ productId, quantity, price }]`, where `price` is the catalog price (integer MNT, 20000+) unless the chat shows a different agreed price.

The delivery zone is set at ship time (skill `named-zone-ship`). Supplier invoices go to skill `invoice-purchase`.

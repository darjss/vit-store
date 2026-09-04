---
name: messenger-order
description: >-
  Messenger-order from a Facebook chat screenshot. Use when imageKeys show a
  customer Messenger thread (phone, address, products), or the admin says add
  order from this screenshot.
---

# Messenger order

## Steps

1. Same turn: `extract_order_from_chat_image_keys({ imageKeys })` → phone, address, notes, product lines.  
   **Done:** structured extract in hand.

2. Match products (`product.searchProductsInstant`); ambiguous → that line only. Build **draft** order (default status `created`, paymentStatus `pending` unless admin said paid).  
   **Done:** draft complete.

3. **Deliver** draft → **soft-confirm** “create this order?” → `order.addOrder`. **Deliver** order number.  
   **Done:** created or declined.

Supplier invoices → skill `invoice-purchase`. Zone at ship time → skill `named-zone-ship`.

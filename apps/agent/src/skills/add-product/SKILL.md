---
name: add-product
description: >-
  Catalog add-product from an Amazon URL or product name. Use when the admin
  pastes amazon.com, asks to scrape/import a listing, or add a product by name.
---

# Add product

## Steps

1. `aiProduct.extractProduct({ query })` → **draft** fields.  
   **Done:** draft in hand (or extract failed and admin told).

2. **Deliver** draft: EN+MN name, brand, potency, amount, suggested price, image count, short description. Ask stock + price.  
   **Done:** admin answered stock/price or cancelled.

3. `product.addProduct` with draft + images + confirmed stock/price. **Deliver** id + name.  
   **Done:** product created (or admin declined).

Batch of URLs: **soft-confirm** once, then `aiProduct.batchCreateProducts`.

---
name: stock-paste
description: >-
  Stock-paste warehouse counts onto catalog products. Use when the admin pastes
  nickname+qty lines (… sh), or asks to set үлдэгдэл / нөөц / stock.
---

# Stock paste

## Steps

1. Parse lines → name tokens + trailing qty; search each (`product.searchProductsInstant`). Ambiguous → ask that line only.  
   **Done:** every line matched or clarified.

2. Build **draft** (name, id, old→new). Telegram: `post_telegram_product_photo` per product + `post_telegram_message` with `stock_ok` / `stock_no`.  
   **Done:** draft delivered and awaiting ✅ (or cancelled).

3. On ✅ for that draft message id → `product.setProductStock`. **Deliver** what changed.  
   **Done:** stocks applied.

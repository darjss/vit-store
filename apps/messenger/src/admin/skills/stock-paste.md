---
name: stock-paste
description: >-
  Stock-paste warehouse counts onto catalog products. Use when the admin pastes
  nickname + quantity lines (… sh), or asks to set үлдэгдэл / нөөц / stock.
---

# Stock paste

Each pasted line is a product nickname followed by a count, like `d3 5000 12 sh`.

## Steps

1. Split each line into name tokens and the trailing count. Search each with `product.searchProductsInstant({ query, limit: 5 })`. When a line has several plausible hits, ask about that line only.
   Done when every line maps to one product id.

2. Post the draft. For each product, `post_telegram_product_photo({ productId, caption })`. Then one `post_telegram_message` listing name and old stock → new stock per line, with `buttons: [{ text: "✅ Тийм", callback_data: "stock_ok" }, { text: "❌ Үгүй", callback_data: "stock_no" }]`. End the turn.
   Done when the draft message with buttons is posted.

3. The admin's tap arrives as a new turn naming the draft message id:
   - `✅ Баталгаажууллаа (draft message N)`: run `product.setProductStock({ id, newStock })` for every line of draft N, then deliver what changed.
   - `❌ Цуцаллаа (draft message N)`: deliver that nothing changed.

   Done when the stocks are applied, or the cancel is delivered.

The buttons only respond in a private chat with the bot. In a group, ask for a typed "тийм" instead.

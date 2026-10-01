---
name: named-zone-ship
description: >-
  Named-zone ship for paid pending orders. Use when the admin says ship / илгээ,
  wants every paid order shipped, or picks a delivery zone by place name.
---

# Named zone ship

`order.shipOrder({ orderId, addressZoneId })` ships one order, and only accepts orders with `status: "pending"`. Zone ids stay internal: the admin sees and picks `zoneName`.

## One order

1. If the order already has `addressZoneId`, go to step 3. Otherwise run `order.suggestZonesForAddress({ address })` with the order's address and deliver the top 2-3 `zoneName`s as choices.
   Done when the admin picked a name.

2. Take the picked name's `zoneId` from that suggestion result. When the admin names a zone outside the list, find it in `order.getDeliveryAddressZones()`.
   Done when you hold one `zoneId`.

3. Run `order.shipOrder`. Deliver the result, naming the `zoneName` used.
   Done when the order shipped, or you delivered the error.

## Ship all paid

The Telegram `ship_all` button ships every paid pending order in the current brief window that has a zone, then reports shipped and skipped orders itself. Orders without a zone get skipped, so take those through the one-order steps first.

Post `post_telegram_message` with the count and order numbers, plus `buttons: [{ text: "📦 Бүгдийг илгээх", callback_data: "ship_all" }]`. The button is the soft-confirm, and your turn ends once it is posted.

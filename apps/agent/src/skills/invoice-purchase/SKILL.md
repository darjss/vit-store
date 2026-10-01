---
name: invoice-purchase
description: >-
  Invoice-purchase import from supplier screenshots. Use when imageKeys show an
  Amazon, iHerb or Naturebell invoice, or the admin asks to import a purchase
  from photos.
---

# Invoice purchase

## Steps

1. In the same turn, run `extract_purchase_from_image_keys({ provider, imageKeys })`. Pick `provider` from the invoice: `amazon`, `iherb`, `naturebell`, or `unknown`.
   Done when the extraction and its line matches are in hand.

2. Deliver the header (provider, order number, date, shipping cost, total) and the lines grouped as matched, ambiguous, unmatched. For each ambiguous line, ask which of its `candidateMatches` it is. Each unmatched line becomes a new product from its `newProductDraft`, which needs a `categoryId`; ask for any that are missing.
   Done when every line has a `productId` or a complete `newProductDraft`.

3. Soft-confirm the line count, total and provider. Then run `aiPurchase.saveExtractedPurchase({ provider, externalOrderNumber, shippingCost, trackingNumber, items })`, where `items` are the resolved lines. Deliver the saved purchase.
   Done when it is saved, or the admin declined.

Customer chat screenshots go to skill `messenger-order`.

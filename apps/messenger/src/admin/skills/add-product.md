---
name: add-product
description: >-
  Add-product to the catalog from an Amazon URL or a product name. Use when the
  admin pastes an amazon.com link, asks to import a listing, or names a product
  to add.
---

# Add product

One URL or name runs the steps. Several URLs in one message take the batch branch.

## Steps

1. Run `aiProduct.extractProduct({ query })` with the URL or name (3+ characters).
   Done when you hold the draft, or `extractionStatus` is `"failed"` and you delivered its `errors`.

2. Deliver the draft: `name`, `name_mn`, brand, potency, amount, image count, one line of description, and `calculatedPriceMnt` as the suggested price. Ask for stock and price. When `brandId` or `categoryId` is null, ask for those too; `brand.getAllBrands()` and `category.getAllCategories()` list the options.
   Done when the admin gave every missing value, or cancelled.

3. Call `product.addProduct` with the input below. Deliver the new id and name.
   Done when the product exists, or the admin declined.

## addProduct input

From the draft: `name` (100 chars max), `name_mn`, `description` (5+ chars), `dailyIntake`, `amount`, `potency`, `ingredients`, `tags`, `seoTitle`, `seoDescription`, `weightGrams`, `images` (the draft's `[{ url }]`).

From the admin: `stock` (integer, 1+), `price` (integer MNT, 20000+), `brandId` and `categoryId` as numeric strings (`"12"`).

Fixed: `status: "active"`.

## Batch branch

Several Amazon URLs: soft-confirm the list with a stock and price per URL, then run `aiProduct.batchCreateProducts({ items: [{ amazonUrl, stock, price }] })`. Deliver the created ids and each failed URL.

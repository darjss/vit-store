# Price Consistency QA

Issue #2 accepts a deploy-after-price-change tradeoff for storefront product pages and cart UI.
Use this check after a product price changes and the storefront has been redeployed.

## Current Source Of Truth

- PDP, product cards, cart, and cart drawer show the price embedded in the deployed storefront bundle or the price persisted in the browser cart.
- Checkout submits only `productId` and `quantity`; it does not submit browser cart prices.
- `packages/api/src/routers/store/order.ts` reloads products from `ProductsTable`, validates status and stock, and calculates the order/payment total from `ProductsTable.price` plus `deliveryFee`.

This means a stale browser cart can display an old item price until the customer refreshes/re-adds the item, but order creation and payment amount should be based on the current database price.

## Deployed-Site Regression Check

1. In admin/database, pick one active in-stock product and record its old price.
2. Change that product price to a visibly different value.
3. Deploy the storefront after the price change.
4. With Playwriter on the deployed storefront, open the product detail page in a fresh page/session and confirm the PDP price is the new price.
5. Add the product to cart and confirm the cart drawer and `/cart` show the new price.
6. Continue to `/checkout`, submit delivery details, and confirm the payment step total equals:

```text
new product price * quantity + delivery fee
```

7. If testing an already-stale cart, confirm the payment/order total still uses the new database price even if the pre-submit cart summary still displayed the old persisted price.

## Close Criteria For Issue #2

Close #2 only after a fresh deployed-site Playwriter pass confirms the PDP, cart, checkout, and payment amount for the changed product after the post-price-change deploy.

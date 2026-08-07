# Storefront defers delivery zone to admin dispatch

Storefront Customers provide only a natural address. Storefront checkout does not fetch, show, prefill, validate, or depend on TU Delivery zones. A storefront Order stores `addressZoneId` as NULL until dispatch, and placing that Order does not clear a historic Customer zone.

When an admin sends an Order to TU Delivery, the send action requires an explicit zone for that Order. The same action passes that zone to TU Delivery and stores it with the shipped status and `tu-delivery` provider. Dispatch never uses a stored or numeric fallback.

Messenger ordering remains unchanged and may submit a Customer-confirmed zone through the shared Order input. A future resolver may suggest or prefill admin choices, but the dispatch value stays explicit unless a later ADR changes this rule.

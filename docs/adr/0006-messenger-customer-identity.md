# Messenger customer identity

Pre-order Messenger conversations will live only in the Flue agent session keyed by the Page-scoped ID (PSID); no customer row is created until the customer places an order and provides a phone number. At order time the existing phone-keyed customer model is used, and the PSID may be attached to the customer for future recognition on the same Page. This avoids changing the existing order/customer schema for browsing conversations while still supporting returning-customer convenience after a real order.

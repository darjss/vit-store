# Messenger payment surface

Messenger orders will present two payment choices in chat: QPay and bank transfer. QPay opens a dedicated QPay-only storefront payment page so customers are not confused by the full generic payment UI. Bank transfer remains an equal option in Messenger, showing the bank account and a `Шилжүүлсэн` confirmation button; the bot records the claim but does not treat screenshots or button presses as proof of payment. Real confirmation remains in admin tooling or future bank-client automation.

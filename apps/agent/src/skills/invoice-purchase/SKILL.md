---
name: invoice-purchase
description: >-
  Invoice-purchase import from supplier screenshots. Use when imageKeys are a
  Amazon/iHerb/Naturebell invoice, or the admin asks to import a purchase from photos.
---

# Invoice purchase

## Steps

1. Same turn: `extract_purchase_from_image_keys({ provider, imageKeys })`.  
   **Done:** extraction + match statuses in hand.

2. **Deliver** header + lines (matched / ambiguous / unmatched); resolve ambiguities.  
   **Done:** every line resolved.

3. **Soft-confirm** import (count, total, provider) → `aiPurchase.saveExtractedPurchase`. **Deliver** result.  
   **Done:** saved or declined.

Customer Messenger chat screenshots → skill `messenger-order`.

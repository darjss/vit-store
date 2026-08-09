# Guest restock notification proof

Use a staging product with stock `0`. Use phone numbers and email addresses you own.

```bash
export API_URL="https://api-staging.amerikvitamin.mn/trpc/store"
export PRODUCT_ID="7283"
export CHANNEL="email" # email or sms
export CONTACT="you@example.com"

curl --fail-with-body --silent --show-error \
  -H 'content-type: application/json' \
  --data "{\"json\":{\"productId\":${PRODUCT_ID},\"channel\":\"${CHANNEL}\",\"contact\":\"${CONTACT}\"}}" \
  "${API_URL}/product.requestGuestRestockConfirmation" | tee /tmp/restock-request.json

export CHALLENGE_ID="$(jq -r '.result.data.json.challengeId // .result.data.challengeId' /tmp/restock-request.json)"
read -r -p 'Confirmation code: ' CODE

curl --fail-with-body --silent --show-error \
  -H 'content-type: application/json' \
  --data "{\"json\":{\"challengeId\":\"${CHALLENGE_ID}\",\"code\":\"${CODE}\"}}" \
  "${API_URL}/product.confirmGuestRestockSubscription" | tee /tmp/restock-confirm.json
```

Confirm the response reports `success: true`. Run the confirm command again and confirm it fails with HTTP 400. Request and confirm a new challenge for the same product and contact, then confirm `alreadySubscribed: true` and only one open row:

```sql
select product_id, channel, consent_state, delivery_state, count(*)
from ecom_vit_restock_subscription
where product_id = 7283
  and contact = '<normalized test contact>'
  and deleted_at is null
  and delivery_state in ('pending', 'sending')
group by product_id, channel, consent_state, delivery_state;
```

The row must have `consent_state = 'verified'` and `count = 1`. Before confirmation, this query must return no row. Set the product stock above zero and confirm both request and confirmation reject a new alert.

## Browser checks

1. While signed out, open the sheet from the product page, sticky mobile action, a product card, and a search product card. Confirm none navigate to `/login`.
2. Complete both “Утас” and “И-мэйл” guest flows in the sheet. Check keyboard focus, field labels, inline errors, and the success state at a narrow mobile width.
3. Sign in with a verified phone. Confirm the sheet shows only the masked phone, has no phone field, and creates the SMS alert with one click and no OTP.
4. From the signed-in sheet, choose “И-мэйлээр авах” and confirm it uses the guest email confirmation flow.
5. Check PostHog events and request logs. They may contain product ID, channel, customer type, error code, and duplicate state only. They must not contain contacts, codes, challenge IDs, or contact hashes.

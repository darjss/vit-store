# Vit Store

A Mongolia-based ecommerce store (amerikvitamin.mn) selling supplement brands
(NatureBell, MicroIngredients, Nutricost, etc.) with a storefront, admin
dashboard, and server, deployed on Cloudflare Workers via Alchemy. Shopping is
in Mongolian; prices in MNT.

## Language

**Customer**:
A person who places orders. Identified by phone number (unique). Has an optional
`psid` (Facebook Page-Scoped ID) once they've ordered via Messenger.
_Avoid_: Client, buyer, account, user (user = admin/staff, see below)

**User**:
An admin/staff member who operates the dashboard or (future) admin Messenger agent.
_Avoid_: Customer, account

**Page**:
A Facebook Page the Messenger bot is connected to. Distinguishes the test Page
(now) from the production Page (future cutover).
_Avoid_: Facebook page (just "Page")

**PSID**:
Facebook Page-Scoped ID. Per-Page, opaque identifier for a person messaging the
Page. Not the same as a facebook username; not stable across Pages.
_Avoid_: facebook id, messenger id

**Pre-order conversation**:
A Messenger conversation before the customer has placed any order. Identity
lives only in the Flue agent session (Durable Object keyed by PSID). No
`customer` row, no DB writes.

**Order**:
A purchase placed by a Customer. Requires a phone number (`customerPhone`).
Carries address, delivery zone/provider, line items, total, and status.

**Delivery fee**:
The flat fee added to every Order's product total. 6,000 MNT today
(`deliveryFee` in `@vit/shared/constants`), sourced from the delivery provider.
The historical chat export shows 5,000 MNT — a legacy manual-pricing artifact
where the store ate the 1,000 MNT difference to ease chat orders. NOT a spec;
the Messenger agent must use the same 6,000 as the site (via `order.addOrder`,
which adds `deliveryFee` itself). The 5k is being phased out. Customers also ask
when delivery will arrive; default answer in existing chats is "margaash" / next
day unless a more precise delivery status is available.

**Payment**:
A request for payment attached to an Order. After Messenger order confirmation,
the bot presents two Messenger buttons: "QPay-р төлөх" and "Дансаар шилжүүлэх".
QPay opens a new QPay-only storefront page (`/payment/qpay/{paymentNumber}?ct=...`)
that shows QR/app links/checking only — no transfer option, to avoid confusion.
Existing APIs support this: `order.addOrder` returns `paymentNumber` +
`checkoutToken`; `payment.createQr` returns `qr_image`, `qPay_shortUrl`, and app
URLs; `payment.checkQpayPayment` verifies QPay and applies stock. Transfer sends
bank account + total in Messenger and includes a "Шилжүүлсэн" button. The bot
does not verify screenshots (abusable); pressing "Шилжүүлсэн" or saying
"hiisen"/"хийсэн" records/acknowledges a transfer claim and tells the customer
the order proceeds after admin/bank confirmation. Admin confirms real account
balance from dashboard / future Haan Bank client automation.

**Transfer confirmation**:
The admin act of marking a bank-transfer Payment as confirmed (applies stock)
or failed. Today done via dashboard tRPC mutation; the Messenger postback path
is being retired.

**Admin alert**:
An outbound Messenger message pushed to the store owner's fixed PSID
(`RECIPIENT_ID`) to notify them of a new order, a claimed transfer, or a
confirmed payment. One-way; not a conversation.

## Agent surfaces

**Product discovery & advice**: the customer-facing agent accepts BOTH typed
product fragments (e.g. "Selenium 200 mg bga yu") AND inbound photos, from
day one. Text is matched via `searchProducts`; photos are identified via a
vision model and matched to the catalog. No staged rollout between the two.
Real Messenger chats also include advice/comparison flows: "энэ юунд сайн бэ",
"али нь сайн бэ", "найрлага нь юу вэ", "яаж хэрэглэх вэ", and symptom/goal
requests (e.g. collagen, magnesium forms, children's vitamin D). The agent
should answer in the practical admin style: explain what the supplement is
commonly used for, compare forms/ingredients, mention label directions, and
recommend what might help. It must not claim products heal/cure/treat disease
or guarantee outcomes. Avoid heavy "consult a physician" boilerplate in normal
sales chats; use a brief safety caveat only for obvious high-risk cases
(children, pregnancy, medications, severe/chronic symptoms).

**Image pipeline**: the channel handler (trusted code) fetches the inbound
photo from Meta's CDN immediately, uploads it to the existing R2 bucket
(`vit-store-bucket-prod`, same one `apps/server` uses for product images) under
a dedicated `messenger-inbound/` prefix, and dispatches only the R2 key to the
agent. The agent's `identify_product_from_image` tool reads the R2 object, calls
the vision model, and returns a rich text extraction (brand, name, dose, visible
label text, suggested query). The image itself never enters durable session
history — only text I/O is stored. R2 objects under `messenger-inbound/` are
auto-expired after 3 days via an R2 lifecycle rule (zero-code cleanup; preserves
a short debug/tuning window without permanent storage).

**Cart & ordering**: Messenger bot v1 supports the full order flow with
confirmation gates. A conversational cart lives in the Flue DO session state,
surviving the 24-hour window. Product cards carry a "Захиалах" quick reply
(`add_to_cart:productId:...`); a "Сагс харах / Захиалга баталгаажуулах" button
on the cart summary commits. Commit triggers phone → address → delivery zone
resolution → notes collection → customer confirmation, then the `addOrder`
tool. The agent never computes totals itself — `addOrder` adds the 6,000 MNT
delivery fee.

**Delivery zone resolution**: customers should provide a natural address, not
manually choose a TU Delivery zone. A shared resolver maps address text to
`addressZoneId` using Google Maps/Places normalization, static Ulaanbaatar
landmark/zone knowledge generated from historical orders, historical order
examples, and a model ranker. Resolver accuracy and rollout are tested as a
separate workstream from the Messenger chatbot. Until that workstream proves
confidence thresholds, the Messenger chatbot shows top candidates for customer
confirmation rather than silently choosing a zone.

**Model**: one agent, one model — `cloudflare/@cf/moonshotai/kimi-k2.6` via
Workers AI (no API key, AI Gateway on by default). Same model for the vision
tool call and the main chat turn. No second agent, no second model.

**Tool style**: Messenger bot v1 uses normal Flue `defineTool` tools (direct
tool calling), not Codemode. The bot is simple enough that direct tools are
more debuggable and keep the v1 critical path smaller. Codemode is reserved for
the separate delivery-zone resolver eval workstream and the future admin
Messenger agent, where tool count and multi-call orchestration will be much
higher.

**Latency / UX**: the agent runs two sequential model calls on a photo
(vision extraction, then reply composition) for a ~3–9s customer-perceived
total. The webhook still acks Meta in <1s (fetch + R2 put + dispatch). During
the agent's generation the channel sends Messenger typing indicators
(`typing_on`, re-fired periodically) with NO interim message. Typing clears when
the reply (product card) is sent.

**Storefront**: Astro SSR site (`apps/storev2`) on Cloudflare.

**Server**: Hono + tRPC on Cloudflare Workers (`apps/server`). Owns the existing
admin-alert Messenger outbound (`messages.ts`) and the (being-retired) inbound
postback webhook.

**Flue Messenger channel**: A new Flue application using `@flue/messenger` that
owns inbound Messenger Page events and dispatches them to a customer-facing
agent. Sole inbound consumer of the Page. Lives separately from `apps/server`.

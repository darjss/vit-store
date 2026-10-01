# Vit Store Agent

Deployable Flue application for the customer-facing Messenger assistant.

## Commands

```bash
bun install
bun run --filter @vit/assistant check-types
bun run --filter agent check-types
bun run --filter agent build
bun run --filter agent dev
```

Local Cloudflare development is handled by `flue dev --target cloudflare`. The direct HTTP tracer route is exposed at `POST /agents/customer-assistant/:id`; Flue event streaming is available at `GET /agents/customer-assistant/:id`.

## Messenger webhook (Zernio)

Messenger ingress is fronted by Zernio, a third-party inbox API. Configure the
Zernio webhook for the `message.received` event to:

```txt
https://agent.amerikvitamin.mn/channels/messenger/webhook
```

Required secrets/vars:

- `ZERNIO_WEBHOOK_SECRET` — verifies `X-Zernio-Signature` (hex HMAC-SHA256) on POST bodies.
- `ZERNIO_API_KEY` — Bearer key for the inbox API (sends, typing indicators).
- `ZERNIO_ACCOUNT_ID` — the connected Facebook account id; events for other accounts are skipped.
- `ZERNIO_BASE_URL` — optional API base override (default `https://zernio.com/api`); used by local dev capture.
- `MESSENGER_ADMISSION_STORE` — Durable Object binding used to dedupe inbound Zernio event ids before dispatch.

The webhook skips non-`message.received` events, outgoing echoes, non-Facebook
platforms, other accounts, and events older than 3 minutes. It dedupes admission
by account + conversation + the Zernio event `id` (identical on every retry),
keys the customer assistant session with `zernio:v1:<accountId>:<conversationId>`,
and sends a best-effort typing indicator before each reply.

## Tracer-bullet scope

- Uses GLM 5.3 Flash through the Flue Cloudflare Workers AI provider: `cloudflare/@cf/zai-org/glm-5.3-flash`.
- Mounts verified Messenger ingress at `POST /channels/messenger/webhook`.
- Imports prompts/tools from `@vit/assistant` to prove the app/package boundary.
- Declares Flue Durable Object migrations with `new_sqlite_classes` for `FlueRegistry` and `FlueCustomerAssistantAgent`.
- Declares the existing R2 bucket binding as `MESSENGER_INBOUND_BUCKET`; inbound photos are staged under `messenger-inbound/` and only R2 keys reach the agent (#20, below).

Order creation, payment, and delivery-zone resolver logic are intentionally TODOs for later issues.

## Inbound photo identification (#20)

When a customer sends a photo, trusted channel code fetches the attachment
**server-side in the webhook**, stages it under the short-lived
`messenger-inbound/` R2 prefix, and dispatches an agent turn carrying **only the
R2 key** — never a remote url and never a base64 payload (ADR 0003). The
dispatch input gains an `imageKeys` field the model reads.

The assistant then calls the `identify_product_photo` tool, which reads the R2
object by key and runs **Kimi vision** (`@cf/moonshotai/kimi-k2.6`, which
advertises image input) through the Workers AI binding. The tool returns plain
text facts plus suggested catalog queries; the model feeds the best query into
the **same `search_products` tool and card formatter as #19 text search** — no
catalog or card logic is duplicated. The channel-neutral identification domain
(prompt, result shape, parsing) lives in `@vit/assistant`
(`packages/assistant/src/photo.ts`); the R2 fetch/put (`src/lib/messenger-inbound.ts`)
and the AI-binding call (`src/lib/vision.ts`) are app concerns.

Kimi is a reasoning model, so the vision call is given a generous token budget —
too small a budget is consumed entirely by `reasoning_content`, leaving an empty
answer.

### Remote-AI split

`env.AI` is only available on the **remote** Workers AI binding; local miniflare
(`wrangler dev --local`) does not provide it. The webhook staging + dispatch
(fetch → R2 → key) runs anywhere, but the vision call needs real Workers AI.
`scripts/with-worker.ts` boots the worker with the experimental remote AI binding
(Durable Objects stay local) for exactly this reason. The text/cart paths are
unaffected and still pass under `--local` (`bun run smoke:local`).

### R2 lifecycle cleanup

`messenger-inbound/` objects are a short debug/processing window, never durable
storage. R2 lifecycle rules are **not** expressible inline in `wrangler.jsonc`
(no `lifecycle` key in the config schema), so the rule is applied out-of-band
from `r2-lifecycle.messenger-inbound.json` (expire objects with that prefix at
the R2 minimum age of 1 day).

The cleanup is **not optional and not a one-time manual step** — ADR 0003 makes
"short-lived" load-bearing for these customer-PII photos, so the staging code
must never ship without the cleanup also being live. The agent's `deploy` script
therefore re-applies and then verifies the rule on every deploy:

```jsonc
"deploy": "… && wrangler deploy … && bun run r2:lifecycle:apply"
"r2:lifecycle:apply":  "bun run r2:lifecycle:inbound && bun run r2:lifecycle:assert"
"r2:lifecycle:inbound": "wrangler r2 bucket lifecycle set … --file r2-lifecycle.messenger-inbound.json -y"
"r2:lifecycle:assert":  "bun scripts/assert-r2-lifecycle.ts"
```

- `r2:lifecycle:inbound` (re)applies the rule via `wrangler r2 bucket lifecycle
set --file`. `set` replaces the rule set, so it is **idempotent** — running it
  on every deploy is safe.
- `r2:lifecycle:assert` lists the live rules on the bucket and **fails the deploy
  loud** (non-zero exit) if the `messenger-inbound-cleanup` rule is absent, so a
  deploy can't ship the staging code while the cleanup is missing. The bucket
  name and expected rule id are read from `wrangler.jsonc` and
  `r2-lifecycle.messenger-inbound.json` so the check can't drift from the source.

To apply + verify by hand against prod (e.g. first rollout):

```bash
bun run r2:lifecycle:apply          # set rule, then assert it is live
```

### Proof CLI

`bun run photo:proof [imagePath]` boots the worker with real Workers AI and runs
`cli/photo-identify.ts`, which serves a sample photo + an in-memory catalog
fixture and POSTs to the worker's `/messenger/photo-probe` route. The probe runs
the **same units** as the dispatch path (R2 stage → `identify_product_photo`
tool → #19 search + card formatter) and returns the intermediate artifacts the
production path hides inside the agent session, so the CLI can print the R2 key
used, the Kimi vision facts + suggested queries, and the resulting card payloads.
Interactively, `bun run dev:messenger` then `/image <path>` drives the real
signed webhook → R2 → vision path.

## Conversational cart (#21)

`Захиалах` (postback `order_product:<id>`) and the cart-control payloads
(`cart_inc:<id>`, `cart_dec:<id>`, `cart_remove:<id>`, `cart_confirm`,
`cart_clear`, `cart_view`) drive a per-session cart deterministically — handled
in the webhook ahead of the text path, so the whole add → summary → adjust →
remove → confirm lifecycle runs with **no model turn** (and thus under local
miniflare where `env.AI` is unsupported). The cart lives in the `CartStore`
Durable Object keyed by the assistant session id (ADR 0006), so it survives
across turns and is shared with the model's conversational cart tools
(`view_cart` / `update_cart_item` / `remove_cart_item` / `confirm_cart`).
Cart domain logic (reducers, subtotal, summary, payload grammar, confirm gate)
is channel-neutral in `@vit/assistant` (`packages/assistant/src/cart.ts`); the
subtotal reuses the #19 catalog projection (`getProductsByIdsForAssistant`) for
the price snapshot — no catalog logic is duplicated. Checkout does not begin
here: this slice ends at a confirmed cart (order creation is #23).

Real end-to-end proof against a running worker (stub store API + Zernio send
capture, signed webhooks) is driven by the dev console and export replay below.

## Interactive Messenger dev console

`cli/messenger-dev.ts` is an interactive REPL for testing the customer
assistant during development. It drives the **real** local HTTP webhook path:
it builds Zernio-shaped `message.received` events, signs them with
`ZERNIO_WEBHOOK_SECRET` (`X-Zernio-Signature`, exactly as Zernio does), and
POSTs them to the running worker at `POST /channels/messenger/webhook`. It
never forks the webhook or admission logic — the worker verifies the signature
and shapes admission the same way it does in production.

Outbound Zernio inbox API calls are redirected to a small in-CLI capture
server via `ZERNIO_BASE_URL`, so the assistant's real reply path runs
without touching Zernio. Every outgoing send JSON payload is saved to the
gitignored `apps/agent/.dev/sent/` directory for inspection; the bot's output
is also rendered as a terminal chat transcript.

### Setup

1. Create `apps/agent/.dev.vars` (gitignored). Values can be any non-empty dev
   strings — they are **not** real Zernio credentials:

   ```dotenv
   ZERNIO_API_KEY=dev_key
   ZERNIO_WEBHOOK_SECRET=dev_local_secret
   ZERNIO_ACCOUNT_ID=DEV_ACCOUNT_ID
   # Redirect outbound Zernio sends to the CLI capture server:
   ZERNIO_BASE_URL=http://127.0.0.1:8788
   ```

   The `.dev.vars` is created for you on first run if it's missing.

2. Start the console (one command — builds + boots the worker, opens the REPL,
   and tears the worker down on exit):

   ```bash
   cd apps/agent
   bun run dev:messenger
   ```

   The worker's `AI` binding is pointed at real Cloudflare Workers AI (Durable
   Objects stay local) so the bot actually replies — this needs `wrangler`
   logged in and may incur small Workers AI usage. If you already have a worker
   running, run the REPL directly with `bun cli/messenger-dev.ts`, pointing it
   with `MESSENGER_DEV_WORKER_URL` if needed.

### Smoke test (for agents/reviewers after a change)

One command builds, boots the worker, drives the real signed webhook path
through this same CLI, and exits non-zero on failure:

```bash
bun run smoke         # full: real Workers AI turn — asserts dispatch + a bot reply
bun run smoke:local   # fast: --local, no Workers AI — asserts dispatch only (no 500)
```

`smoke:local` needs no Cloudflare auth and catches dispatch-time regressions
(e.g. a 500 before the model). `smoke` additionally proves a real model reply
comes back through the send path.

### Commands

- type any text — sends it through the signed webhook as a customer message
- `/session [name]` — list sessions, or switch/create one
- `/reset` — reset the current session (new PSID → fresh bot memory)
- `/psid` — show the current session id + persistent PSID
- `/buttons` — list the buttons from the last bot message
- `/fire <n>` — fire button _n_'s payload (postback or quick-reply event)
- `/payloads` — list saved outgoing send JSON files
- `/seed [list|<file>]` — replay a private `messenger-chat-history/` example
- `/image <path>` — attach a photo → R2 key → vision → product cards (#20)
- `/quit`

The fake PSID/session persists across runs in `apps/agent/.dev/state.json`
(gitignored), so conversations survive restarts until you `/reset`.

The private `messenger-chat-history/` export (gitignored) is optional and
read-only: `/seed` replays selected customer texts from it but never writes,
commits, or derives payloads from that data.

> Note: `apps/agent/.dev/` and `.dev.vars*` are gitignored. Captured send
> payloads and the private export must never be committed.

## Production deploy

This app is wired into the root turborepo deploy pipeline. From the repo root:

```bash
bun run deploy            # turbo deploy: server → (admin, storev2, agent) in parallel
```

`agent#deploy` is defined in the root `turbo.json` and depends on `server#deploy`
(the agent calls the storefront API via `STORE_API_URL` at runtime, so the server
must be up first). Turbo runs the agent's own `deploy` script, which builds and
patches before publishing:

```bash
bun run build            # flue build --target cloudflare && patch-flue-worker.ts
wrangler deploy --config dist/vit_store_agent/wrangler.json
bun run r2:lifecycle:apply   # (re)apply + assert the messenger-inbound/ cleanup rule
```

The `patch-flue-worker.ts` postbuild step is part of `build`, so build-before-deploy
and the createRequire boot patch always run. The trailing `r2:lifecycle:apply` step
guarantees the short-lived photo cleanup rule is live on every deploy and fails the
deploy if it isn't (see "R2 lifecycle cleanup" above). To deploy just this app:

```bash
bun run --filter agent deploy
```

Validate the pipeline without publishing (no creds needed):

```bash
bun run build --filter agent                                          # build + patch via turbo graph
cd apps/agent && wrangler deploy --dry-run --config dist/vit_store_agent/wrangler.json
```

### Required production secrets / vars

Unlike the alchemy-managed apps, the agent worker is published with `wrangler`, so
bindings come from `wrangler.jsonc` (AI, R2 `MESSENGER_INBOUND_BUCKET`, and the three
Durable Objects) and secrets must be set on the deployed Worker. Set them once with
`wrangler secret put <NAME> --config dist/vit_store_agent/wrangler.json` (never commit
real values):

- `ZERNIO_WEBHOOK_SECRET` — verifies `X-Zernio-Signature` on inbound webhook POSTs.
- `ZERNIO_API_KEY` — Bearer key for the Zernio inbox API (typing + replies).
- `ZERNIO_ACCOUNT_ID` — the connected Facebook account id the webhook accepts.
- `STORE_API_URL` — storefront/server API base URL (defaults to `http://localhost:3000`
  in dev; set to the deployed server origin in prod).
- `TELEGRAM_ADMIN_BOT_TOKEN` — same `@darjsorderbot` token used for outbound order alerts.
- `TELEGRAM_WEBHOOK_SECRET` — `secret_token` for `setWebhook` (letters, numbers, `_`, `-` only).
- `TELEGRAM_ADMIN_CHAT_ID` — allowlisted admin Telegram user id(s) for inbound admin agent (comma-separated for multiple admins). Outbound order alerts go to every id in the list. Anyone can DM `/id` to learn their Telegram user id.

### Telegram admin webhook

Register once (same bot as server-side order notifications):

```txt
https://agent.amerikvitamin.mn/channels/telegram/webhook
```

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://agent.amerikvitamin.mn/channels/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Inbound text from the allowlisted user dispatches to `admin-assistant` (Codemode
`query` tool). Inbound photos are staged to the same
`messenger-inbound/` R2 prefix with `imageKeys` on the dispatch (invoice extraction via
`aiPurchase.extractPurchaseFromImageKeys`). Customer shopping stays on Messenger only.

The R2 bucket (`vit-store-bucket-prod`) and Workers AI binding already exist on the
account; no secret is needed for those. Teardown is manual via
`wrangler delete --config dist/vit_store_agent/wrangler.json` (the agent is not part of
the alchemy `destroy` graph).

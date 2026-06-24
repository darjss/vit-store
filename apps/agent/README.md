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

## Messenger test Page webhook

Configure the Meta test Page webhook URL to:

```txt
https://<agent-worker-host>/channels/messenger/webhook
```

Required secrets/vars:

- `MESSENGER_APP_SECRET` — verifies `X-Hub-Signature-256` on POST bodies.
- `MESSENGER_VERIFY_TOKEN` — Meta GET webhook handshake token.
- `MESSENGER_PAGE_ID` — fixed test Page id accepted by the channel.
- `MESSENGER_PAGE_ACCESS_TOKEN` — Page token used for typing indicators and text replies.
- `MESSENGER_ADMISSION_STORE` — Durable Object binding used to dedupe inbound Messenger message ids before dispatch.

The channel ignores echoes/non-text events in this slice, dedupes admission by Page + conversation + `message.mid`, keys the customer assistant session with `messenger:v1:page:<PAGE_ID>:page-scoped-id:<PSID>`, sends `typing_on` before dispatch, and only clears typing in the reply tool after the assistant sends one simple text message via Graph `messages`.

## Tracer-bullet scope

- Uses Kimi through the Flue Cloudflare Workers AI provider: `cloudflare/@cf/moonshotai/kimi-k2.6`.
- Mounts verified Messenger ingress at `GET/POST /channels/messenger/webhook`.
- Imports prompts/tools from `@vit/assistant` to prove the app/package boundary.
- Declares Flue Durable Object migrations with `new_sqlite_classes` for `FlueRegistry` and `FlueCustomerAssistantAgent`.
- Declares the existing R2 bucket binding as `MESSENGER_INBOUND_BUCKET`; inbound photos are staged under `messenger-inbound/` and only R2 keys reach the agent (#20, below).

Order creation, payment, and delivery-zone resolver logic are intentionally TODOs for later issues.

## Inbound photo identification (#20)

When a customer sends a photo, trusted channel code fetches the Meta CDN
attachment **server-side in the webhook**, stages it under the short-lived
`messenger-inbound/` R2 prefix, and dispatches an agent turn carrying **only the
R2 key** — never a Meta CDN url and never a base64 payload (ADR 0003). The
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
the R2 minimum age of 1 day):

```bash
bun run r2:lifecycle:inbound        # wrangler r2 bucket lifecycle set …
# or, equivalently:
wrangler r2 bucket lifecycle add vit-store-bucket-prod messenger-inbound-cleanup messenger-inbound/ --expire-days 1
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

Real end-to-end proof against a running worker (stub store API + Send API
capture, signed webhooks):

```bash
bun run dev                       # worker on :3583
bun scripts/cart-demo.ts          # add → merge → add → inc → dec → remove → confirm
bun scripts/cart-dedupe-probe.ts  # same mid twice → add applied once
```

For a no-secret local proof of the text path/payload shape:

```bash
cd apps/agent
bun run mock:messenger-text -- "sain baina uu"
```

## Interactive Messenger dev console

`cli/messenger-dev.ts` is an interactive REPL for testing the customer
assistant during development. It drives the **real** local HTTP webhook path:
it builds Meta-shaped events, signs them with `MESSENGER_APP_SECRET`
(`X-Hub-Signature-256`, exactly as Meta does), and POSTs them to the running
worker at `POST /channels/messenger/webhook`. It never forks the webhook or
admission logic — the worker verifies the signature and shapes admission the
same way it does in production.

Outbound Graph **Send API** calls are redirected to a small in-CLI capture
server via `MESSENGER_GRAPH_BASE_URL`, so the assistant's real reply path runs
without touching Meta. Every outgoing Send API JSON payload is saved to the
gitignored `apps/agent/.dev/sent/` directory for inspection; the bot's output
is also rendered as a terminal chat transcript.

### Setup

1. Create `apps/agent/.dev.vars` (gitignored). Values can be any non-empty dev
   strings — they are **not** real Meta credentials:

   ```dotenv
   MESSENGER_APP_SECRET=dev-app-secret
   MESSENGER_VERIFY_TOKEN=dev-verify-token
   MESSENGER_PAGE_ID=DEV_PAGE_ID
   MESSENGER_PAGE_ACCESS_TOKEN=dev-page-token
   # Redirect outbound Graph Send API to the CLI capture server:
   MESSENGER_GRAPH_BASE_URL=http://127.0.0.1:8788
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
(e.g. a 500 before the model). `smoke` additionally proves a real Kimi reply
comes back through the Send API.

### Commands

- type any text — sends it through the signed webhook as a customer message
- `/session [name]` — list sessions, or switch/create one
- `/reset` — reset the current session (new PSID → fresh bot memory)
- `/psid` — show the current session id + persistent PSID
- `/buttons` — list the buttons from the last bot message
- `/fire <n>` — fire button *n*'s payload (postback event, or quick-reply message)
- `/payloads` — list saved outgoing Send API JSON files
- `/seed [list|<file>]` — replay a private `messenger-chat-history/` example
- `/image` — placeholder until #20 (photo identification) lands
- `/quit`

The fake PSID/session persists across runs in `apps/agent/.dev/state.json`
(gitignored), so conversations survive restarts until you `/reset`.

The private `messenger-chat-history/` export (gitignored) is optional and
read-only: `/seed` replays selected customer texts from it but never writes,
commits, or derives payloads from that data.

> Note: `apps/agent/.dev/` and `.dev.vars*` are gitignored. Captured Send API
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
```

The `patch-flue-worker.ts` postbuild step is part of `build`, so build-before-deploy
and the createRequire boot patch always run. To deploy just this app:

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

- `MESSENGER_APP_SECRET` — verifies `X-Hub-Signature-256` on inbound webhook POSTs.
- `MESSENGER_VERIFY_TOKEN` — Meta GET webhook handshake token.
- `MESSENGER_PAGE_ID` — fixed test Page id accepted by the channel.
- `MESSENGER_PAGE_ACCESS_TOKEN` — Page token for typing indicators and replies.
- `STORE_API_URL` — storefront/server API base URL (defaults to `http://localhost:3000`
  in dev; set to the deployed server origin in prod).

The R2 bucket (`vit-store-bucket-prod`) and Workers AI binding already exist on the
account; no secret is needed for those. Teardown is manual via
`wrangler delete --config dist/vit_store_agent/wrangler.json` (the agent is not part of
the alchemy `destroy` graph).

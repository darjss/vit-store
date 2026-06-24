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
- Declares the existing R2 bucket binding as `MESSENGER_INBOUND_BUCKET`; later Messenger photo slices should store objects under `messenger-inbound/` and pass only R2 keys into agent history.

Product search, photo identification, cart, order, payment, and delivery-zone resolver logic are intentionally TODOs for later issues.

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

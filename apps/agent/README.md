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

The channel ignores echoes/non-text events in this slice, keys the customer assistant session with `messenger:v1:page:<PAGE_ID>:page-scoped-id:<PSID>`, sends `typing_on` while the assistant runs, and replies with one simple text message via Graph `messages`.

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

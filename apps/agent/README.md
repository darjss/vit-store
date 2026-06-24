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

## Tracer-bullet scope

- Uses Kimi through the Flue Cloudflare Workers AI provider: `cloudflare/@cf/moonshotai/kimi-k2.6`.
- Imports prompts/tools from `@vit/assistant` to prove the app/package boundary.
- Declares Flue Durable Object migrations with `new_sqlite_classes` for `FlueRegistry` and `FlueCustomerAssistantAgent`.
- Declares the existing R2 bucket binding as `MESSENGER_INBOUND_BUCKET`; later Messenger photo slices should store objects under `messenger-inbound/` and pass only R2 keys into agent history.

Full Messenger channel, product search, photo identification, cart, order, payment, and delivery-zone resolver logic are intentionally TODOs for later issues.

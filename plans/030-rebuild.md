# Plan 030: rebuild vit-store

Status: research done, foundation next. Items marked (open) wait on my answer.

Every agent working on the rebuild reads this whole file first. If you hit something this file doesn't answer, ask me. Don't guess my intent from old docs, because most of them predate this plan.

## Why

This codebase is an artifact. It's been built by every model since Sonnet 3.5, and you can tell. Workarounds on workarounds, two UI kits, raw SQL casts everywhere, analytics that swallow errors, stock math that's wrong on cancel and refund. Fixing vit-store feels better than starting over somewhere else, so vit-store stays the repo. But almost everything inside it gets rebuilt.

The goal: mom packs boxes and decides what to buy. Software does everything else. Buyers find the right product fast, pay in a few taps, and come back.

## Who uses it

- Mom runs the admin on her phone 90% of the time and on an iPad the other 10%. Phone first, always.
- I use the admin on a laptop and ask agents questions about sales.
- Buyers are mostly on phones, a lot of them cheap old Androids on mobile data. The storefront has to be fast there, not just on my laptop.
- Agents. They call the API, answer my sales questions and build features. They're users too.

## What I want

### Stack, decided

- All UI is Solid 2: storefront and admin. Betas and RCs are fine, this is my project. Use server frames and server components where they actually help.
- No Effect anywhere in the backend. Plain TypeScript. The one exception is `infra/`, because Alchemy 2 resources are written in Effect syntax. App code never imports from `infra/`.
- oRPC v2. The API is an SDK. Agents get it as typed agent tools. No MCP for now.
- valibot for schemas. No zod. Drizzle derives schemas from tables through `drizzle-orm/valibot`.
- Types flow db to contract to UI. No OpenAPI codegen step.
- Drizzle RC with a new db schema. The rebuild owns the `shop` migrations after the fork, and the new schema is amerik-vitamin's `shop` schema (`~/dev/amerik-vitamin/packages/db/src/schema.ts`). It was designed from vit-store's mistakes: uuid ids, a stock move log, order events, payments as a ledger, slug history, Better Auth tables, supplier orders, an outbox. amerik-vitamin's migrations are frozen, so only this repo migrates `shop`. Port it off Effect, fill the gaps vit-store needs, and migrate the data with its legacy import as the starting point. Its rules come along too: `docs/COMMERCE-RULES.md` and the "bugs to never repeat" list in `docs/LEGACY.md` over there. Don't carry old mistakes forward to stay compatible.
- Better Auth. Admins sign in with Google. No passkeys, no shared bot token, no KV sessions nobody can revoke. Agents get scoped API keys.
- The `shop` schema gains three tables: restock requests, deliveries and product images.
- Alchemy 2 beta. CI is the only thing that deploys. Every PR gets its own preview stage.
- No second infra provider and no Neon. Dev, previews and staging use one Postgres on my dev box, reached through its `dev-box` Cloudflare Tunnel and Hyperdrive with an Access service token. Each PR gets its own database there. Previews being down while the box is off is fine. Prod stays on the existing Postgres.
- The new stack runs on staging for a while before it touches prod. Staging lives on the dev box, so the soak is mom and me placing real orders, not customers.
- Axiom keeps logs and traces and sends alerts. Monitors and a Telegram notifier are Alchemy resources in `infra/` through `@alchemy.run/axiom`, so an alert is reviewed like code. Errors are typed.
- `vp` for everything. Bun goes. `vp dev` is the one local command: it starts Postgres, migrates, seeds synthetic fixtures and runs every Worker.
- Tailwind v4, with `@shadcn/lint` enforcing the design system. Rules agents can verify beat rules in a doc.
- CI gates. Type checks run on tsrs, not tsgo.
- Delivery fee is 6,000.
- Purchases get the new flow amerik-vitamin built: supplier orders imported from Amazon order history, grouped into batches by delivery burst, counted on arrival, the rest closed as not coming, and a suggested price in 5,000 steps that mom can edit. The rules are in amerik's `docs/COMMERCE-RULES.md`, the backend in its PR #27 and the screens in its PR #30.
- The customer Messenger bot gets rebuilt on Pi Durable (`@earendil-works/pi-durable`, pinned exactly) with one Durable Object per Messenger thread, deployed by Alchemy. It sells full time and hands off to mom or me when it should, like erxes frontline's bots. Its tools call the oRPC SDK, every message is mirrored to Postgres, and mom reads and takes over chats in the admin. Pi is experimental and its storage only rolls forward, so upgrades are deliberate PRs. The Telegram admin assistant stays on the old Worker until A6 and P4 land.

### Stack, picked from research

Rule for all of these: use a good maintained library. I don't want a custom implementation of something a library already does well. One library per job, and the dead-code gate fails a second one.

| Job | Pick | Notes |
| --- | --- | --- |
| Package manager | vp 1.6 on pnpm 12, `catalogMode: strict` | turbo and bun go |
| Type check | tsrs inside `vp check` via `OXLINT_TSGOLINT_PATH` | 3.2x to 4.8x faster than tsgo on our code with a third of the memory, same errors. A CI job runs both for a week and fails when they disagree, then tsgo goes |
| Headless UI, storefront | native `<dialog>` and `popover`, nothing else | buyers' phones can't pay 25 to 70 KB gzip per widget |
| Headless UI, admin | (open) quoin-ui 0.6 or UI SDK (`@ui-sdk/solid`), decided by a bake-off when the admin starts | quoin is versecafe's Base UI port. UI SDK is Vercel Labs' behavior library with a native Solid 2 adapter, a skill for agents, `checkPattern()` for ARIA and 5,800 Solid e2e specs. It patches `@solidjs/web` until a Solid release includes solidjs/solid#4836, so don't install it before that. One wins, the other never lands. Kobalte's modal ignores Escape, Ark and Corvu don't run on Solid 2 |
| Primitives | `@solid-primitives/*` `next` tags: media, storage, event-listener, intersection-observer, scheduled, timer, connectivity, clipboard | |
| Animation | plain CSS plus `motion/mini`, View Transitions for page changes | compositor-only properties, `prefers-reduced-motion` respected |
| Data fetching | Solid router `query` and `action` with the oRPC client | no TanStack Query |
| Forms | Formisch `/v2` with valibot | |
| Lint | dmmulroy/anti-slop at HEAD, vendored with its `install-anti-slop` skill and recorded in `UPSTREAM.md`. Plus `eslint-plugin-solid` 0.19 `v2-strict`, `@shadcn/lint`, type-aware rules on `tsrs-lint`, and a `vit` plugin with our own rules | all run as oxlint jsPlugins, checked on Solid 2 files. No `effect/` plugin. oRPC has no lint plugin, so `vit/orpc-require-output` is ours. oxlint can't see JSON or a file-level disable, so a grep gate in `vp check` bans lint-disable comments and `"./*"` exports. Report: `lint.md` |
| Agent tools | `@orpc/ai-sdk` over the router | valibot inputs go through `toStandardJsonSchema` |
| Auth | Better Auth 1.7, Google allowlist for admins, api-key plugin for agents, phone OTP for buyers | one instance per request because of Hyperdrive |
| Database | Drizzle RC on `pg` through Hyperdrive | dev-box Postgres through the Tunnel for dev, previews and staging. It needs TLS on, because Hyperdrive requires it. The existing Postgres for prod |
| Dead code | fallow | the repo already has `.fallowrc.json` and it ran clean on a copy. Switch to knip only if fallow can't read Solid 2 |
| Other gates | gitleaks, size-limit, Renovate | |
| Images | Cloudflare image transformations, `@unpic/core` for srcset, upload originals at 1600 px | background cutout with `segment=foreground` |
| Fonts | one variable family with ө, ү and ₮ | today's fonts miss those glyphs and cost 260 KB |
| Frames | Port the DUND pattern to rc.21. Server components for markup that rarely changes: home shelves, `/angilal`, category grids, the product body, brand and guide pages. The CDN caches those frame streams through `GET` plus `respond` headers and a Cache API wrapper, purged by the writer. Price and stock are a separate live frame that is never cached. Client components only for the cart, add buttons, buy bar, search, filters and checkout | I already ran frames on Workers in July: `~/dev/store-kit`, branch `demo-solid-plugged`, `apps/demo-solid-store`. Read its review route and benchmark first. Check that the beta.26 bug where fresh frame slots lost captured context is fixed. Public documents never send a traceparent, or the trace meta tag makes them uncacheable. Try `live()` for payment status on `/pay/<n>` before writing a poll |
| Analytics | PostHog only, same-origin proxy on the storefront Worker | Cloudflare Basin can't feed PostHog. Revisit at millions of events |
| Recommendations | a Postgres `product_related` table, rebuilt on a schedule, rendered on the server | co-purchase first, filled from category and brand so it's never empty |
| Infra | Alchemy 2 | Effect syntax is allowed in `infra/` and nowhere else |
| Messenger bot | Pi Durable 1.5.2 on Durable Object SQLite, models through pi-ai and AI Gateway | ran in local workerd: tool calls, idempotent requests, state across a restart. 345 KB gzip. Cloudflare's `agents` ships a Pi host to try. Report: `agent-runtime.md` |

### Rules from the audit

Each of these becomes a lint rule or a CI gate, and each rule's message names the correct fix.

- No `.catch(() => 0)` or any catch that turns an error into a default value. Errors stay errors all the way to the UI.
- One cache layer, purged by the code that writes. Stock is always read live.
- Typed oRPC errors, one `onError` that logs once, one db client per request.
- Package exports are explicit. No `"./*"`.
- No complexity disables, no lint-disable comments.

### How it looks and feels

- Seamless, playful, fun animations. Tasteful background hues. Never distracting, never in the way of buying.
- Admin keeps the new look from vit-store PR #373, which I like much better than the old UI, and gets ported to Solid 2 after the storefront. amerik's screens bring their flows, not their look.
- Fast on cheap phones beats every animation. If an effect costs frames on a slow Android, it goes.

### Storefront

- Order flow is the most important thing in this repo. Browse, product, cart, checkout and payment. Checkout becomes one page: cart, phone, address, payment method and one pay button.
- Redesign the sidebar and every other cursed bit, not just checkout.
- SEO pages that drive sales, not pages for the sake of pages.
- Photos look better than they do now: resized properly, high quality, `fetchpriority` on the main image, explicit sizes.
- Recommended products are good and always work. Right now they're basic and broken half the time.
- The numbers I hold it to: Lighthouse mobile 95 or better on home, category and product. From PostHog web vitals at p75: LCP under 2.0 s, INP under 150 ms, CLS under 0.05. At most 45 KB of gzipped JS on listing and product pages and 60 KB on checkout, enforced by size-limit. Fonts under 50 KB. Proxy loss under 2%.

### Data

- PostHog gets used way more. All product and sales analytics live there.
- PostHog runs through a proxy on our own domain so adblockers don't eat events.
- Money events fire from the server. The PostHog person id is our customer id, never a phone hash, because an 8-digit phone hash reverses in seconds.
- Revenue comes from the Postgres ledger synced into PostHog's warehouse. Events carry the funnel and attribution.
- When I ask an agent about sales, it answers from PostHog. Agents shouldn't grind raw SQL to tell me what sold last week.

### How agents work here

Agent experience is the point of the whole rebuild. Every choice gets judged by whether the next agent ships faster and breaks less.

- Machine-checkable rules over docs. One check command. Short AGENTS.md.
- Use a library before custom code. No backward compatibility. Delete code.
- No unit tests. The test is e2e against the PR's deployed preview.
- A Bash hook blocks the commands agents keep getting wrong.
- No erxes-specific rules. Only generic lessons carry over.
- Work runs as T3 delegates, each in its own worktree under `~/dev/scratchpad/vit-store`. Never in `~/dev/vit-store`, the main checkout.
- Never point local runs at production mutations. Never write to the prod database without my OK.
- Upstream bugs are mine to report. When Solid 2, frames, the router, the vite plugin, oRPC, Alchemy, Drizzle or Pi breaks or acts strange, stop and tell me. Bring a minimal repro in `~/dev/scratchpad/vit-store/upstream/<package>-<short-name>/`, the exact versions, what you expected and what happened, and the source line you think is wrong. Search the upstream issues first and link any match. A workaround in our code is fine to keep moving, but it carries a comment linking the upstream issue, and it gets deleted when the fix ships. I file the issues and PRs myself. Agents don't open them.

## Order of work

1. Research. Done, seven reports listed below.
2. Foundation on staging: repo protection and secret scanning, vp, Alchemy 2 stages, the new schema with a data migration, Better Auth, Axiom, CI gates, local dev.
3. The API as an SDK, with the commerce bugs fixed in the new code: QPay checks the paid amount, stock moves correctly on cancel, refund, delete and restore, order status changes go through one transition table, saving a product never overwrites stock. Cost follows amerik's COMMERCE-RULES: the latest landed cost, stored as whole ₮.
4. Storefront in Solid 2, order flow first.
5. Admin in Solid 2.
6. PostHog everywhere, plus agent tools for sales questions.
7. Cut over: staging carries real orders for a while, then prod switches to the new stack through a manual approval in CI, and the old apps get deleted.

## PRs

One row is one PR for one agent in one worktree. At most three run at once. A PR starts when everything in its "needs" column has merged. Take the lowest id whose needs are met. If a PR grows past one reviewable diff, split it and tell me the new ids.

| Id | PR | Needs |
| --- | --- | --- |
| 0a | This plan lands on main | |
| 0b | Delete the dead `/webhooks/messenger` route | |
| 0c | Storefront fonts: one variable family with ө, ү and ₮ | |
| 0d | Uploads keep 1600 px originals instead of 800x600 | |
| F1 | vp 1.6 on pnpm 12 with a strict catalog. Bun and turbo go | 0a |
| F2 | One `vp check`: tsrs plus the tsgo parity job, anti-slop at HEAD, `eslint-plugin-solid`, `@shadcn/lint`, the `vit` rules with one RuleTester each, the grep gates, gitleaks, size-limit, fallow, Renovate, the Bash hook, a short AGENTS.md | F1 |
| F3 | Alchemy 2 stages `pr-N`, `staging` and `prod`, deployed by CI only. A TCP route on the `dev-box` Tunnel, an Access service token, Hyperdrive per stage, one database per PR created and migrated by CI | F1 |
| F4 | `shop` schema ported off Effect, plus restock requests, deliveries, product images and `product_related`. One baseline migration | F1 |
| F5 | Legacy import into the staging database, checked by row counts and order totals | F4 |
| F6 | Better Auth: Google allowlist for admins, API keys for agents, phone OTP for buyers | F3, F4 |
| F7 | Axiom logs and traces, one `onError`, monitors with a Telegram notifier: 5xx rate, payment check failures, database errors, the `product_related` job not running, the bot's model errors and open handoffs | F3 |
| F8 | `vp dev`: Postgres with TLS on the dev box, migrations, synthetic fixtures, every Worker through `alchemy dev` on named local URLs | F3, F4 |
| A1 | oRPC v2 router: valibot from the tables, typed errors, one db client per request, the typed client | F4, F7 |
| A2 | Catalog: products, brands, categories, slug history, images, live stock | A1 |
| A3 | Orders: one transition table, stock moves on cancel, refund, delete and restore | A1 |
| A4 | Payments: QPay checks the paid amount, bank transfers, the payments ledger | A3 |
| A5 | Purchases: supplier orders imported from Amazon order history, batches by delivery burst, receive and count, close what's not coming, landed cost in whole ₮, price suggestions in 5,000 steps, restock requests, deliveries. Port of amerik PR #27 off Effect | A3 |
| A6 | Agent tools through `@orpc/ai-sdk`, scoped by API key | A2, A4, A5, F6 |
| A7 | `product_related` rebuilt on a schedule: co-purchase first, then category and brand | A3 |
| S1 | Storefront shell: DUND frames on rc.21, Tailwind v4 tokens, the font, images through Cloudflare transforms and `@unpic/core`, a Cache API wrapper for frame streams | F2, F3 |
| S2 | Browse: home, categories, brands, search, the new sidebar | S1, A2 |
| S3 | Product page: main photo with `fetchpriority`, stock from the server, recommendations | S2, A7 |
| S4 | One-page checkout: QPay deep link or transfer details, payment status polling | S3, A4, F6 |
| S5 | SEO: ingredient guides, brand hubs, JSON-LD, one sitemap URL per product | S3 |
| P1 | PostHog proxy on the storefront Worker, client events | S1 |
| P2 | Money events from the server, person id is the customer id | P1, A4 |
| P3 | Postgres ledger synced into PostHog's warehouse | P2 |
| P4 | Agent tools that answer sales questions from PostHog | P3, A6 |
| D0 | Admin UI bake-off: quoin 0.6 against UI SDK on date picker, combobox, select and toast | a Solid release with solidjs/solid#4836 |
| D1 | Admin shell: Google sign-in, the cream look from PR #373 | D0, F6 |
| D2 | Orders on mom's phone: list, pack, status | D1, A3, A4 |
| D3 | Products: edit, 1600 px upload, background cutout | D1, A2 |
| D4 | Purchases: arrivals by batch, the counter per product, close, the prices sheet with suggestions, restock. amerik PR #30's flow in PR #373's look | D1, A5 |
| D5 | Admin home: today's numbers | D2 |
| M0 | Bot spike, 30 minutes: Pi Durable in a Durable Object deployed by Alchemy to a preview stage, one real model call, `PiHarness` bundle size | F3, the model and key I approve |
| M1 | Bot Worker: Zernio ingress and sends, the Session Durable Object, taps and ice breakers, the Mongolian prompt, photos and stickers | M0, A2 |
| M2 | Bot sells: oRPC tools through a Pi tool shim, cart, delivery, order and payment link, the paid signal from the outbox | M1, A4, A6 |
| M3 | Bot hands off: escalate tool and triggers, the handoff document with a 12 hour sleep, Telegram ping, every message mirrored to Postgres | M2 |
| M4 | Admin inbox: open handoffs first, transcript, order cards, reply through Zernio, give back to bot | M3, D2 |
| C1 | Rehearsal: a fresh prod snapshot imported into staging, and mom and I place real orders there | S4, S5, D5, P3, M3 |
| C2 | Prod switches to the new stack behind a manual CI approval | C1 |
| C3 | Delete the old apps and packages | C2 |

Not PRs: branch protection, secret scanning and push protection through `gh`, which I approved. UTM tags in Ads Manager and deleting the hashed phone ids in PostHog are mine to do.

## Out of scope for now

- The storefront hard-line copy issues: the "албан ёсоор" wording, the certification badges and health-claim copy.
- The old `/webhooks/messenger` route signature. Customer Messenger runs through Zernio and `apps/messenger` now (ADR 0011), so the old route is dead code to delete.
- MCP.
- Rebuilding the Telegram admin assistant. It waits for A6 and P4.
- Server-side carts. Abandoned checkouts live in PostHog.

## Research reports

They live in `~/dev/scratchpad/vit-store/rebuild-research/`, outside the repo. This file holds the decisions. Read a report when you work in its area.

| Report | Covers |
| --- | --- |
| `audit.md` | Cursed architecture and smelly code across the repo. Not security. |
| `ui-stack.md` | Headless UI, solid-primitives, animation, frames on the storefront, `@shadcn/lint` with Solid, images, perf on cheap Androids |
| `platform-stack.md` | vp, local dev, knip and other gates, tsrs, oRPC agent tools, Better Auth with Google on Workers, new schema and data migration |
| `storefront.md` | Full storefront redesign: order flow, sidebar, cursed UI, SEO that sells, photos |
| `data.md` | PostHog proxy, event plan, data warehouse for sales questions, recommendations that work |
| `lint.md` | anti-slop upstream and every repo's copy, ranked rules, Solid 2 and type-aware lint, the `vit` rules, a proposed config |
| `agent-runtime.md` | Pi Durable for the Messenger bot, Alchemy deploy, tools, escalation, today's bot features mapped, a spike plan |

# Plan 030: rebuild vit-store

Status: research running. Decided items are decided. Open items get settled by the research reports, then this file gets updated.

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
- No Effect anywhere in the backend. Plain TypeScript.
- oRPC v2. The API is an SDK. Agents get it as typed agent tools. No MCP for now.
- valibot for schemas. No zod. Drizzle derives schemas from tables through `drizzle-orm/valibot`.
- Types flow db to contract to UI. No OpenAPI codegen step.
- Drizzle RC with a new db schema, and the new schema is amerik-vitamin's `shop` schema (`~/dev/amerik-vitamin/packages/db/src/schema.ts`). It was designed from vit-store's mistakes: uuid ids, a stock move log, order events, payments as a ledger, slug history, Better Auth tables, supplier orders, an outbox. Port it off Effect, fill the gaps vit-store needs, and migrate the data with its legacy import as the starting point. Its rules come along too: `docs/COMMERCE-RULES.md` and the "bugs to never repeat" list in `docs/LEGACY.md` over there. Don't carry old mistakes forward to stay compatible.
- Better Auth. Admins sign in with Google. No passkeys, no shared bot token, no KV sessions nobody can revoke. Agents get scoped API keys.
- Alchemy 2 beta. CI is the only thing that deploys. Every PR gets its own preview stage.
- The new stack runs on staging for a while before it touches prod.
- Axiom keeps logs and traces. Errors are typed.
- `vp` for everything. Bun goes.
- Tailwind v4, with `@shadcn/lint` enforcing the design system. Rules agents can verify beat rules in a doc.
- CI gates. Type checks run on tsrs, not tsgo.
- Delivery fee is 6,000.

### Stack, open until research lands

- Headless UI library for Solid 2.
- Which solid-primitives packages we use, and whether they work on Solid 2.
- Animation library.
- How frames and server components fit the storefront.
- Image pipeline.
- Local dev stack.
- knip and the other gates and tools.
- PostHog proxy and data warehouse setup.
- Recommendations approach.

Rule for all of these: use a good maintained library. I don't want a custom implementation of something a library already does well.

### How it looks and feels

- Seamless, playful, fun animations. Tasteful background hues. Never distracting, never in the way of buying.
- Admin keeps the cream look from PR #373 and gets ported to Solid 2 after the storefront.
- Fast on cheap phones beats every animation. If an effect costs frames on a slow Android, it goes.

### Storefront

- Order flow is the most important thing in this repo. Browse, product, cart, checkout and payment. Checkout becomes one page: cart, phone, address, payment method and one pay button.
- Redesign the sidebar and every other cursed bit, not just checkout.
- SEO pages that drive sales, not pages for the sake of pages.
- Photos look better than they do now: resized properly, high quality, `fetchpriority` on the main image, explicit sizes.
- Recommended products are good and always work. Right now they're basic and broken half the time.

### Data

- PostHog gets used way more. All product and sales analytics live there.
- PostHog runs through a proxy on our own domain so adblockers don't eat events.
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

## Order of work

1. Research. Five reports, listed below.
2. Foundation on staging: vp, Alchemy 2 stages, the new schema with a data migration, Better Auth, Axiom, CI gates, local dev.
3. The API as an SDK, with the commerce bugs fixed in the new code: QPay checks the paid amount, stock moves correctly on cancel, refund, delete and restore, order status changes go through one transition table, saving a product never overwrites stock, average cost gets a numeric column.
4. Storefront in Solid 2, order flow first.
5. Admin in Solid 2.
6. PostHog everywhere, plus agent tools for sales questions.
7. Cut over: staging carries real orders for a while, then prod switches to the new stack through a manual approval in CI, and the old apps get deleted.

## Out of scope for now

- The storefront hard-line copy issues: the "албан ёсоор" wording, the certification badges and health-claim copy.
- The old `/webhooks/messenger` route signature. Customer Messenger runs through Zernio and `apps/messenger` now (ADR 0011), so the old route is dead code to delete.
- MCP.

## Research reports

Each lands in `~/dev/scratchpad/vit-store/rebuild-research/` and then feeds this file.

| Report | Covers |
| --- | --- |
| `audit.md` | Cursed architecture and smelly code across the repo. Not security. |
| `ui-stack.md` | Headless UI, solid-primitives, animation, frames on the storefront, `@shadcn/lint` with Solid, images, perf on cheap Androids |
| `platform-stack.md` | vp, local dev, knip and other gates, tsrs, oRPC agent tools, Better Auth with Google on Workers, new schema and data migration |
| `storefront.md` | Full storefront redesign: order flow, sidebar, cursed UI, SEO that sells, photos |
| `data.md` | PostHog proxy, event plan, data warehouse for sales questions, recommendations that work |

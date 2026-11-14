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
- No Effect anywhere in the backend. Plain TypeScript.
- oRPC v2. The API is an SDK. Agents get it as typed agent tools. No MCP for now.
- valibot for schemas. No zod. Drizzle derives schemas from tables through `drizzle-orm/valibot`.
- Types flow db to contract to UI. No OpenAPI codegen step.
- Drizzle RC with a new db schema. The rebuild owns the `shop` migrations after the fork, and the new schema is amerik-vitamin's `shop` schema (`~/dev/amerik-vitamin/packages/db/src/schema.ts`). It was designed from vit-store's mistakes: uuid ids, a stock move log, order events, payments as a ledger, slug history, Better Auth tables, supplier orders, an outbox. Port it off Effect, fill the gaps vit-store needs, and migrate the data with its legacy import as the starting point. Its rules come along too: `docs/COMMERCE-RULES.md` and the "bugs to never repeat" list in `docs/LEGACY.md` over there. Don't carry old mistakes forward to stay compatible.
- Better Auth. Admins sign in with Google. No passkeys, no shared bot token, no KV sessions nobody can revoke. Agents get scoped API keys.
- The `shop` schema gains three tables: restock requests, deliveries and product images.
- Alchemy 2 beta. CI is the only thing that deploys. Every PR gets its own preview stage.
- The new stack runs on staging for a while before it touches prod.
- Axiom keeps logs and traces. Errors are typed.
- `vp` for everything. Bun goes.
- Tailwind v4, with `@shadcn/lint` enforcing the design system. Rules agents can verify beat rules in a doc.
- CI gates. Type checks run on tsrs, not tsgo.
- Delivery fee is 6,000.

### Stack, picked from research

Rule for all of these: use a good maintained library. I don't want a custom implementation of something a library already does well. One library per job, and the dead-code gate fails a second one.

| Job | Pick | Notes |
| --- | --- | --- |
| Package manager | vp 1.6 on pnpm 12, `catalogMode: strict` | turbo and bun go |
| Type check | tsrs inside `vp check` via `OXLINT_TSGOLINT_PATH` | |
| Headless UI | native `<dialog>` and `popover` first, quoin-ui 0.6 where native has no answer | quoin is my Base UI port. Lazy load each widget. Kobalte's modal ignores Escape, Ark and Corvu don't run on Solid 2 |
| Primitives | `@solid-primitives/*` `next` tags: media, storage, event-listener, intersection-observer, scheduled, timer, connectivity, clipboard | |
| Animation | plain CSS plus `motion/mini`, View Transitions for page changes | compositor-only properties, `prefers-reduced-motion` respected |
| Data fetching | Solid router `query` and `action` with the oRPC client | no TanStack Query |
| Forms | Formisch `/v2` with valibot | |
| Design lint | `@shadcn/lint` as an oxlint jsPlugin | all six rules fire on Solid `class=` |
| Agent tools | `@orpc/ai-sdk` over the router | valibot inputs go through `toStandardJsonSchema` |
| Auth | Better Auth 1.7, Google allowlist for admins, api-key plugin for agents, phone OTP for buyers | one instance per request because of Hyperdrive |
| Database | Drizzle RC on `pg` through Hyperdrive | Neon branch per PR and for staging, the existing Postgres for prod |
| Dead code | (open) fallow or knip | the repo already has `.fallowrc.json` |
| Other gates | gitleaks, size-limit, Renovate | |
| Images | Cloudflare image transformations, `@unpic/core` for srcset, upload originals at 1600 px | background cutout with `segment=foreground` |
| Fonts | one variable family with ө, ү and ₮ | today's fonts miss those glyphs and cost 260 KB |
| Frames | Port the DUND pattern to rc.21, then server components for listing and product pages | I already ran frames on Workers in July: `~/dev/store-kit`, branch `demo-solid-plugged`, `apps/demo-solid-store`. Read its review route and benchmark first. Check that the beta.26 bug where fresh frame slots lost captured context is fixed, and whether frame documents can be cached at the CDN yet |
| Analytics | PostHog only, same-origin proxy on the storefront Worker | Cloudflare Basin can't feed PostHog. Revisit at millions of events |
| Recommendations | a Postgres `product_related` table, rebuilt on a schedule, rendered on the server | co-purchase first, filled from category and brand so it's never empty |
| Infra | (open) Alchemy 2 | its infra files are written in Effect syntax, which may break the no-Effect rule |

### Rules from the audit

Each of these becomes a lint rule or a CI gate, and each rule's message names the correct fix.

- No `.catch(() => 0)` or any catch that turns an error into a default value. Errors stay errors all the way to the UI.
- One cache layer, purged by the code that writes. Stock is always read live.
- Typed oRPC errors, one `onError` that logs once, one db client per request.
- Package exports are explicit. No `"./*"`.
- No complexity disables, no lint-disable comments.

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
- Upstream bugs are mine to report. When Solid 2, frames, the router, the vite plugin, oRPC, Alchemy or Drizzle breaks or acts strange, stop and tell me. Bring a minimal repro in `~/dev/scratchpad/vit-store/upstream/<package>-<short-name>/`, the exact versions, what you expected and what happened, and the source line you think is wrong. Search the upstream issues first and link any match. A workaround in our code is fine to keep moving, but it carries a comment linking the upstream issue, and it gets deleted when the fix ships. I file the issues and PRs myself. Agents don't open them.

## Order of work

1. Research. Done, five reports listed below.
2. Foundation on staging: repo protection and secret scanning, vp, Alchemy 2 stages, the new schema with a data migration, Better Auth, Axiom, CI gates, local dev.
3. The API as an SDK, with the commerce bugs fixed in the new code: QPay checks the paid amount, stock moves correctly on cancel, refund, delete and restore, order status changes go through one transition table, saving a product never overwrites stock. Cost follows amerik's COMMERCE-RULES: the latest landed cost, stored as whole ₮.
4. Storefront in Solid 2, order flow first.
5. Admin in Solid 2.
6. PostHog everywhere, plus agent tools for sales questions.
7. Cut over: staging carries real orders for a while, then prod switches to the new stack through a manual approval in CI, and the old apps get deleted.

## Out of scope for now

- The storefront hard-line copy issues: the "албан ёсоор" wording, the certification badges and health-claim copy.
- The old `/webhooks/messenger` route signature. Customer Messenger runs through Zernio and `apps/messenger` now (ADR 0011), so the old route is dead code to delete.
- MCP.
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

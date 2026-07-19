# Amerik Vitamin — vit-store

Mongolia-based ecommerce store ([amerikvitamin.mn](https://amerikvitamin.mn)) selling
US-imported vitamins and supplements (NatureBell, MicroIngredients, Nutricost, and more).
Shopping is in Mongolian; prices in MNT (₮). 99% of traffic is mobile.

The monorepo contains four apps — a storefront, an admin dashboard, an API server, and a
Facebook Messenger AI shopping agent — plus shared packages, all deployed to Cloudflare via
[Alchemy](https://alchemy.run) (TypeScript IaC).

## What's in here

### Apps (`apps/`)

| App | Stack | What it does |
|-----|-------|--------------|
| **`storev2`** | Astro 5 + SolidJS islands, Tailwind v4, tRPC | Customer-facing storefront. Catalog with brand/category filtering, search, product detail pages, SolidJS cart, checkout (phone → address → delivery zone → confirmation), order tracking, QPay payment, OTP phone login. Neo-brutalist, mobile-first design (see `DESIGN.md`). |
| **`admin`** | React 19 + Vite + TanStack Router/Query, tRPC, shadcn/ui | Internal dashboard. Product CRUD with AI-assisted extraction from Amazon URLs, order management, customer records (phone-based), brand/category management, purchase/inventory tracking (Amazon/iHerb imports), payment confirmation (QPay + bank transfer), analytics (sales, top products, PostHog web analytics). |
| **`server`** | Hono + tRPC + Drizzle, Cloudflare Workers | Central API gateway. Three tRPC routers: `/trpc/admin` (dashboard), `/trpc/store` (storefront), `/trpc/bot` (Messenger admin agent). REST routes for Google OAuth, QPay webhook, Messenger webhook, image uploads. PostgreSQL via Hyperdrive, R2 for images, KV for sessions, a `ProductSearchObject` Durable Object for edge search, rate limiting, structured logging. |
| **`agent`** | Flue (`@flue/runtime`, `@flue/messenger`) + Cloudflare Workers AI | Facebook Messenger bot. **Customer agent** (`@cf/moonshotai/kimi-k2.6`): product search, photo identification (vision model + R2-staged images), advice/comparison, conversational cart, checkout, QPay/transfer payment choices. **Admin agent**: Codemode query tool, PSID-gated. Inbound photos are fetched from Meta's CDN, staged to R2 under `messenger-inbound/` (auto-expired after 3 days), and only the R2 key enters session history. Dedup via Durable Objects (admission, cart, checkout stores). |

### Packages (`packages/`)

| Package | Purpose |
|---------|---------|
| **`@vit/api`** | tRPC routers (admin/store/bot), Drizzle DB queries, integrations (Messenger, QPay, PostHog, Resend, SMS gateway), AI product-extraction pipeline, payment logic. |
| **`@vit/assistant`** | Shared tools and instructions for the Messenger agents — product search, advice, photo identification, cart/checkout, payment choices, delivery-zone ranking, admin Codemode tool. |
| **`@vit/shared`** | Domain types, Valibot schemas, constants (delivery fee 6,000₮, bank transfer details, status enums). |
| **`@vit/logger`** | Structured logging middleware for Hono. |

## Tech stack

- **Runtime/dep manager**: Bun, Turborepo
- **Storefront**: Astro 5 (SSR via `@astrojs/cloudflare`), SolidJS islands, Tailwind v4
- **Admin**: React 19, Vite, TanStack Router/Query, shadcn/ui
- **Server**: Hono, tRPC v11, Drizzle ORM
- **Agent**: Flue framework, Cloudflare Workers AI (`@cf/moonshotai/kimi-k2.6`)
- **Database**: PostgreSQL 16 (Drizzle ORM, Hyperdrive connection pooling in prod)
- **Storage**: Cloudflare R2 (product + inbound images), KV (sessions/cache)
- **State**: Durable Objects (product search, Flue agent sessions, Messenger dedup/cart/checkout)
- **IaC/deploy**: Alchemy → Cloudflare Workers (server, agent) and Pages (storev2, admin)
- **Lint/format**: Biome, oxlint; type checks via `tsc`

## Getting started

Install dependencies:

```bash
bun install
```

### Database

PostgreSQL via Docker (port 5433):

```bash
bun db:docker:up        # docker-compose up -d
bun db:push             # push Drizzle schema
```

### Local dev with Caddy

A `Caddyfile` provides local TLS domains so OAuth/cookies behave like prod:

| Local domain | Proxies | App |
|--------------|---------|-----|
| `https://vitstore.dev` | `localhost:4321` | storev2 |
| `https://api.vitstore.dev` | `localhost:3006` | server |
| `https://admin.vitstore.dev` | `localhost:3005` | admin |

Run everything in dev (Turborepo):

```bash
bun dev
```

Or run a single app:

```bash
bunx turbo dev --filter=storev2
bun dev:server
bunx turbo dev --filter=admin
```

The agent runs via Wrangler locally:

```bash
cd apps/agent && bun dev   # builds then wrangler dev
```

### Deploy

Each app deploys via Alchemy to Cloudflare (prod stage reads `../../.env.prod`):

```bash
bun deploy          # turbo deploy (server first, then frontends)
```

## Available scripts

| Script | Description |
|--------|-------------|
| `bun dev` | Start all apps in dev mode |
| `bun build` | Build all apps |
| `bun check-types` | TypeScript checks across all apps |
| `bun deploy` | Deploy all apps |
| `bun db:push` | Push Drizzle schema to the database |
| `bun db:migrate` / `bun db:migrate:local` | Run migrations (prod/local) |
| `bun db:studio` / `bun db:studio:local` | Open Drizzle Studio |
| `bun db:seed` | Seed the database |
| `bun db:docker:up` / `bun db:docker:down` | Start/stop the Postgres container |
| `bun cache:maintain` | Preview or clear the owned analytics KV cache scope |
| `bun lint` / `bun lint:fix` | Biome lint / autofix |
| `bun format` | Biome format |
| `bun check` | oxlint |
| `bun knip` | Dead-code/dependency analysis |
| `bun quality` | `check-types` + `fallow dead-code` + `fallow health` |
| `bun vit:extract` / `bun vit:compare` | Scrape/compare vit product catalog |

### Cache maintenance

Cache maintenance has no default environment or scope. Every invocation must select `local`, `staging`, or `production`, the `analytics` scope, and a namespace. An invocation without `--confirm` is a non-mutating preview; staging and production previews do not contact Cloudflare.

Use a unique namespace name and persistence directory for disposable local work:

```bash
bun cache:maintain -- --environment local --scope analytics --namespace-id <unique-local-name> --persist-to <absolute-path>
bun cache:maintain -- --environment local --scope analytics --namespace-id <unique-local-name> --persist-to <absolute-path> --confirm local:<unique-local-name>
```

Remote operations additionally require both the account and namespace IDs. Replace placeholders from the intended Alchemy stage output; do not copy identifiers between environments:

```bash
bun cache:maintain -- --environment staging --scope analytics --account-id <staging-account-id> --namespace-id <staging-namespace-id>
bun cache:maintain -- --environment staging --scope analytics --account-id <staging-account-id> --namespace-id <staging-namespace-id> --confirm staging:<staging-namespace-id>

bun cache:maintain -- --environment production --scope analytics --account-id <production-account-id> --namespace-id <production-namespace-id>
bun cache:maintain -- --environment production --scope analytics --account-id <production-account-id> --namespace-id <production-namespace-id> --confirm production:<production-namespace-id> --confirm-production DELETE-PRODUCTION-CACHE
```

The package script disables Bun env-file loading. Wrangler runs from an isolated directory with only its user-level authentication configuration and the explicitly supplied account ID; it does not load the repository `.env` files.

## Project structure

```
vit-store/
├── apps/
│   ├── storev2/   # Storefront (Astro + SolidJS)
│   ├── admin/     # Admin dashboard (React + TanStack Router)
│   ├── server/    # API gateway (Hono + tRPC, Cloudflare Workers)
│   └── agent/     # Messenger AI bot (Flue + Workers AI)
├── packages/
│   ├── api/       # @vit/api — routers, DB queries, integrations
│   ├── assistant/ # @vit/assistant — agent tools & instructions
│   ├── shared/    # @vit/shared — types, schemas, constants
│   └── logger/    # @vit/logger — Hono logging middleware
├── docs/
│   ├── adr/       # Architecture decision records
│   └── agents/    # Agent workflow docs (issue tracker, triage, domain)
├── CONTEXT.md     # Product + domain language (customers, orders, payments, agent surfaces)
├── PRODUCT.md     # Product register, users, brand personality, design principles
├── DESIGN.md      # Storefront design system (colors, type, components)
├── Caddyfile      # Local dev reverse proxy (vitstore.dev / api / admin)
└── docker-compose.yml  # Local PostgreSQL 16
```

## Further reading

- `CONTEXT.md` — product context, domain language (Customer, Order, Payment, PSID, delivery zones), and agent surfaces.
- `PRODUCT.md` — product register, users, brand personality, design principles.
- `DESIGN.md` — storefront design system (neo-brutalist, color tokens, typography, components).
- `docs/adr/` — architecture decision records (Messenger agent, R2 photo pipeline, payment surface, delivery-zone resolution, admin Codemode agent, etc.).
- `AGENTS.md` — agent workflow conventions (issue tracker, triage labels, domain docs, browser automation rules).

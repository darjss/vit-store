# Admin V1 Solid Rewrite

## Goal

Replace the current admin with a small Solid app that works on one iPhone 14 Pro. V1 supports only:

- Home
- Products
- Orders
- Analytics

The app keeps the useful current behavior, removes table-first layouts, fixes API persistence and cache behavior, and uses cards for lists with focused detail and edit screens.

## Non-goals

Do not build these in V1:

- Purchases
- Customers
- Brands
- Categories
- Review products
- Messenger admin UI
- Advanced analytics
- Desktop-first tables
- A full design system

Unused admin pages should leave the navigation and then be deleted after cutover. Delete unused admin API procedures only after checking Messenger and storefront consumers.

## Core decisions

### Runtime

- SolidJS
- Vite
- TanStack Solid Router
- TanStack Solid Query
- TanStack Solid Form
- Kobalte for accessible behavior
- tRPC for the API boundary
- PWA support retained for the admin

Build the replacement in a temporary `apps/admin-v2` app so the current admin remains available during dogfood. Delete the old app after the replacement passes the cutover checks. Do not maintain both apps after cutover.

### UI direction

Use the approved B + C direction:

- Card Workspace for Products and Orders lists
- Single-Task Flow for product and order details
- Mobile defines the layout at 393x852
- Desktop uses wider cards and panels, not tables by default
- Warm storefront tokens remain the base
- Admin uses quiet cream surfaces with hue and dither treatment
- Butter is reserved for primary actions
- Status colors use lavender, apricot, coral, lemon, and warm gray
- Do not use blue or green for status
- Every status has text and an icon

### Shared UI package

Create `packages/ui` as a small Solid package. It owns reusable behavior and tokens, not business screens.

Initial exports:

- Button
- IconButton
- Input
- Field
- Select
- Combobox
- Dialog
- Drawer
- Menu
- Tabs
- Toast
- Badge
- Skeleton
- EmptyState
- InlineAlert
- FormSection

Use Kobalte underneath. Keep `ProductCard`, `OrderCard`, `ProductForm`, `OrderDetail`, and analytics sections inside the admin app.

Do not copy the store-kit visual style. Copy only useful mechanics from these references:

- `/home/darjs/dev/store-kit/packages/admin/src/catalog/query-options.ts`
- `/home/darjs/dev/store-kit/packages/admin/src/orders/query-options.ts`
- `/home/darjs/dev/store-kit/packages/admin/src/catalog/cache.ts`
- `/home/darjs/dev/store-kit/packages/admin/src/query-options/result.ts`
- `/home/darjs/dev/store-kit/packages/admin/src/AdminShell.tsx`

Useful mechanics to adopt:

- Query option factories
- Hierarchical query keys
- Separate query and mutation modules
- Central cache update and invalidation helpers
- Local form drafts with reset from the saved response
- Global transport error handling
- Auth invalidation from query and mutation cache errors
- No duplicated query definitions inside page components

Do not add Better Result only for style. tRPC already provides typed transport errors. Add a result wrapper only if the new API contract needs an explicit domain-error union.

## Data contracts

Use the current admin tRPC procedures for the replacement app. Do not add an `admin.v1` API namespace for this rewrite.

Before each feature lands, document the current procedure and response shape it uses. Fix the existing procedure or query when its behavior is wrong. Keep API changes separate by domain so workers do not edit the same router file.

Every read must return the complete shape needed by its screen. Avoid one query per card or one query per metric.

Every write must:

- Validate input on the server
- Run the required database transaction
- Return the authoritative saved entity
- Return the latest `updatedAt` or version
- Return a typed domain error for expected conflicts
- Return a transport error for server or network failures
- Never return fabricated fallback data

Use the order ID as its real string type. Do not parse alphanumeric order codes as numbers.

Use optimistic concurrency for product and order edits where the database supports it. A stale edit should show a conflict and reload option instead of silently overwriting newer data.

## Cache policy

### Workers Cache

Use Workers Cache only for read-heavy, non-sensitive analytics results after the admin session passes.

Cache:

- Historical analytics snapshots
- Historical dashboard metrics
- PostHog-backed reports

Do not cache:

- Pending orders
- Order detail
- Order status
- Product detail
- Inventory
- Payment state
- Mutation responses

Analytics cache keys must include:

- Date range
- Exact start and end time
- Business timezone
- Schema version
- Permission scope if permissions become multi-user

Starting TTLs:

- Daily: 5 minutes
- Weekly: 15 minutes
- Monthly: 30 minutes

After product, inventory, payment, or order writes, purge the analytics tag. The database remains authoritative. Workers Cache only reduces repeated read work.

Remove the current broad admin KV cache middleware from the new V1 path. Do not use one generic cached procedure for all admin reads.

## Query client rules

Create one QueryClient in the admin shell.

Defaults:

- No refetch on window focus for routine admin queries
- Retry reads once for transient failures
- Do not retry mutations automatically
- Keep query data in TanStack Query
- Keep only form drafts, selection, and view state in Solid signals or stores
- Do not mirror query data into a second store
- Use URL search state for filters and date ranges

Query modules should live under:

```text
apps/admin-v2/src/data/
  home.ts
  products.ts
  orders.ts
  analytics.ts
  query-keys.ts
  errors.ts
  invalidation.ts
```

Each domain module exports query options and mutation options. Components call those options but do not define request functions.

## Parallel work plan

Use separate worktrees under `~/dev/scratchpad/vit-store/`. Workers must stay inside their owned paths. Do not let parallel workers edit shared package manifests, router indexes, or the same route file.

### Track 0: API contract and data audit

Owner: one API lead. Must finish before integration.

Paths:

- Existing procedures under `packages/api/src/routers/admin/`
- `packages/api/src/queries/`
- `packages/shared/src/`
- `apps/server/src/`

Tasks:

- Inventory current V1 consumers and mutations
- Define V1 response and error shapes
- Fix product write persistence
- Fix order detail ID handling
- Fix order status transition rules
- Fix analytics range handling
- Remove fabricated analytics fallback values
- Define analytics cache and purge tags
- Add integration checks against the real database

Deliverable:

- A written V1 contract list
- Separate router files for home, products, orders, and analytics
- API checks proving product and order writes survive reload

### Track 1: Shared Solid UI package

Can run in parallel with Track 0. It must not edit admin feature files.

Paths:

- `packages/ui/`
- package manifest changes provided as a patch for the integrator

Tasks:

- Set up the Solid package
- Add Kobalte wrappers
- Add shared tokens and admin theme variables
- Add focus, disabled, loading, and error states
- Add 44px touch target defaults
- Add reduced-motion behavior
- Add basic form field semantics
- Add status badge tones without blue or green

Deliverable:

- Importable `@vit/ui` primitives
- Small usage examples
- Type check and build proof

### Track 2: Solid app shell and navigation

Depends on Track 1 package names and basic exports. Can begin with temporary local imports.

Paths:

- `apps/admin-v2/src/app/`
- `apps/admin-v2/src/routes/`
- `apps/admin-v2/src/styles/`
- `apps/admin-v2/src/main.tsx`
- `apps/admin-v2/vite.config.ts`

Tasks:

- Create the Solid Vite app
- Add the QueryClient and router providers
- Add the admin session boundary
- Add mobile bottom navigation
- Add desktop expansion without changing the mobile information order
- Add app-level loading, error, not-found, and recovery states
- Add PWA configuration
- Add the approved cream, hue, dither, status, and typography tokens
- Make the shell work at 320, 375, 393, 430, 768, and 1440px

Deliverable:

- App shell with placeholder routes
- Keyboard navigation and visible focus
- No horizontal scrolling at supported widths

### Track 3: Products feature

Can begin once the API contract names are stable. Own this directory only:

```text
apps/admin-v2/src/features/products/
```

Tasks:

- Products card list
- Search and filters
- Product detail page
- Inline detail editing
- Product form page
- Image area and upload boundary
- Stock summary and stock edit action
- Status and draft behavior
- Dirty form warning and save feedback
- Loading, empty, error, retry, and success states
- Product query and mutation modules
- Product cache update and invalidation helper

Required behavior:

- Create product, reload, product remains
- Edit product, return to list, new data appears
- Update stock, detail and list agree
- Search and filters stay in URL state
- Detail page keeps useful existing inline edits

### Track 4: Orders feature

Can begin once the API contract names are stable. Own this directory only:

```text
apps/admin-v2/src/features/orders/
```

Tasks:

- Order card list
- Search and status filters
- Order detail page
- Product thumbnails in order cards and detail
- Customer, delivery, and payment sections
- Status progression
- Next-action button
- Order status mutation
- Conflict and stale-data handling
- Loading, empty, error, retry, and success states
- Order query and mutation modules
- Order cache update and invalidation helper

Required behavior:

- Every real alphanumeric order ID opens
- Status change persists after reload
- List and detail agree after a status change
- Pending actions never use Workers Cache
- Filtered empty states explain what happened

### Track 5: Home feature

Depends on the home API shape and shell. Own this directory only:

```text
apps/admin-v2/src/features/home/
```

Tasks:

- Work queue
- Recent order cards with product images
- Low-stock product cards
- Quick actions
- Small historical metrics section
- Loading, empty, error, and retry states

Rules:

- Pending orders remain fresh
- Historical metrics may use the analytics cache
- No hard-coded growth percentages
- No large metric wall
- Every card points to a useful next screen

### Track 6: Analytics feature

Can run in parallel with Home after the analytics API contract is stable. Own this directory only:

```text
apps/admin-v2/src/features/analytics/
```

Tasks:

- Date-range controls
- Analytics snapshot query
- Cache freshness label when useful
- Three key metrics
- One trend view
- Top products
- Low-stock or attention section
- Empty and unavailable states
- No fake charts or placeholder products

Required behavior:

- Daily, weekly, and monthly ranges change all related values
- Analytics cache keys include exact range and timezone
- Cache purge runs after relevant writes
- PostHog failure shows unavailable state, not zero-valued fiction

### Track 7: Browser verification

Can begin with the prototype and expand as routes land. Do not use mock tests.

Paths:

- `apps/admin-v2/e2e/`
- `qa-reports/`

Tasks:

- Real browser checks against a seeded development database
- iPhone viewport checks at 393x852
- Desktop check at 1440px
- Product create, edit, stock, image, and reload checks
- Order list, detail, status, and reload checks
- Home links and empty states
- Analytics range and cache checks
- Keyboard traversal
- Reduced motion
- 200% text zoom
- No horizontal overflow

Required evidence:

- Screenshots for the main routes
- Console and network error capture
- A short pass/fail report per route
- Persistence proof after reload

## Shared-file ownership

Only the integration owner may edit these files:

- Root `package.json`
- `bun.lock`
- `apps/admin-v2/package.json`
- `apps/admin-v2/vite.config.ts`
- `apps/admin-v2/src/main.tsx`
- `apps/admin-v2/src/routes/routeTree.tsx`
- `packages/api/src/routers/admin/index.ts`
- `packages/ui/package.json`

Feature workers must add files under their own feature directories and export route components for the integrator.

## Integration order

1. Track 0 API contract and persistence fixes
2. Track 1 shared UI package
3. Track 2 app shell
4. Track 3 Products and Track 4 Orders in parallel
5. Track 5 Home and Track 6 Analytics in parallel
6. Track 7 browser verification
7. Deploy the replacement only to staging
8. Dogfood on the real iPhone
9. Fix all staging findings
10. Cut over the admin domain when explicitly approved
11. Delete the old admin and unused procedures

## Route completion checklist

A route is complete only when:

- It works at 393x852 without horizontal scroll
- It works with keyboard navigation
- It has one page heading
- It has loading, empty, error, retry, and success states
- All controls have accessible names
- Writes show pending and failure feedback
- A successful write persists after reload
- Related cards update after a mutation
- No raw enum or library error reaches the UI
- No fake or fabricated data appears
- Reduced motion works
- Long Mongolian text wraps without breaking layout

## Cutover criteria

Deploy the replacement only to staging until the owner approves the cutover. Do not deploy the replacement to production as part of V1 development.

Cut over only after:

- Products create and edit pass real browser checks
- Orders detail and status updates pass real browser checks
- Home data matches the database
- Analytics ranges and cache behavior pass checks
- No P0 or P1 issues remain in V1
- The real admin completes the main product and order workflows on the iPhone
- The old routes are no longer needed

After cutover:

- Remove `apps/admin`
- Rename `apps/admin-v2` to `apps/admin` if needed
- Remove unused admin routes and procedures
- Update deployment configuration
- Keep this plan and the final QA report as the migration record

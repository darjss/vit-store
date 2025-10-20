# dashboard migration todo

## home page

- [ ] - pending orders overview with count and quick actions
- [ ] - daily, weekly, monthly revenue cards with trend indicators
- [ ] - daily, weekly, monthly order count cards with growth percentages
- [ ] - sales chart showing revenue trends over time
- [ ] - recent orders list with status and customer info
- [ ] - top selling products of the day/week
- [ ] - quick stats dashboard (total customers, total products, total orders)
- [ ] - revenue c- [ ] - low stock alerts for products
omparison with previous periods
- [ ] - web analytics visited counts for daily and weekly and monthly 
- [ ] - abondened cart count 

## analytics page

- [ ] - comprehensive revenue analytics with date range filters
- [ ] - profit margin analysis and trends
- [ ] - most ordered products list with quantities and revenue
- [ ] - most purchasing users list with order counts and total spent
- [ ] - customer lifetime value analysis
- [ ] - product performance metrics (views, conversions, returns)
- [ ] - seasonal sales patterns and forecasting
- [ ] - average order value trends
- [ ] - peak sales hours and days analysis
- [ ] - customer retention and churn analysis
- [ ] - product category performance comparison

## orders page

- [ ] - orders list component with filter/pagination
- [ ] - order details view
- [ ] - order status management (pending, shipped, delivered, cancelled, refunded)
- [ ] - order search functionality

## products page

- [ ] - add product component/form
- [ ] - upload image feature
- [ ] - edit product form
- [ ] - list products with filter/pagination
- [ ] - search product functionality
- [ ] - product status management (active, draft, out_of_stock)
- [ ] - bulk product operations
- [ ] - inventory management

## purchases page

- [ ] - purchases list component with filter/pagination
- [ ] - purchase details view
- [ ] - purchase status management
- [ ] - purchase search functionality
- [ ] - purchase analytics and reporting

## brands page

- [x] - add brand component/form
- [x] - edit brand form
- [x] - list brands with filter/pagination
- [ ] - search brand functionality
- [ ] - brand status management

## categories page

- [x] - add category component/form
- [x] - edit category form
- [ ] - list categories with filter/pagination
- [ ] - search category functionality
- [ ] - category hierarchy management
- [ ] - category status management

## users page

- [ ] - users list component with filter/pagination
- [ ] - user details view
- [ ] - user search functionality
- [ ] - user role management
- [ ] - user status management
- [ ] - user activity tracking

## general features

- [ ] - responsive design for all pages
- [ ] - loading states and error handling
- [ ] - toast notifications for actions
- [ ] - confirmation dialogs for destructive actions
- [ ] - data validation and form handling
- [ ] - accessibility improvements

## Data Persistence Issue - SOLUTION IMPLEMENTED

### The Problem
Your seeded data was not persisting across dev server restarts because:

1. **Alchemy creates a fresh D1 database instance each dev session** - The local D1 database is ephemeral during development
2. **No automated seeding on startup** - The migration files create the schema, but the seed data wasn't being applied
3. **Missing seed entry point** - There was no `db:seed` npm script to run the seeding logic

### What Was Done
1. ✅ Added `db:seed` script to `apps/server/package.json` that runs `src/lib/seed-cli.ts`
2. ✅ Created `apps/server/src/lib/seed-cli.ts` - A CLI entry point that:
   - Connects to the local SQLite database (`.wrangler/state/d1/miniflare-D1DatabaseObject/vit-store-db.sqlite`)
   - Uses better-sqlite3 and drizzle-orm to interact with the database
   - Calls the existing `seedDatabase()` function from `src/lib/seed.ts`
   - Resets and repopulates all seed data

### How to Use Going Forward

#### Option 1: Manual Seeding (After Dev Server Starts)
```bash
# In a separate terminal after the dev server is running
cd apps/server
bun run db:seed
```

#### Option 2: Automatic Seeding (Recommended - Coming Soon)
To fully automate this, add to your `alchemy.run.ts` after the database setup completes:
```typescript
// After the db definition, before app.finalize()
await Exec("db-seed", {
	cwd: "apps/server",
	command: "bun run db:seed",
	memoize: {
		patterns: ["src/lib/seed.ts"],
	},
});
```

#### Option 3: Add to Your Dev Startup Script
Add to your package.json root scripts or shell script:
```bash
# After alchemy starts, seed the database
bun --cwd apps/server run db:seed
```

### Database File Location
- **Path**: `.wrangler/state/d1/miniflare-D1DatabaseObject/vit-store-db.sqlite`
- This is created automatically when your dev server starts
- Data persists in this file until it's reset or migrated

### Seed Data Source
Your existing seed function already contains:
- 5 Brands
- 6 Categories  
- 15 Products with multiple images
- 15 Customers
- 10 Orders with details
- Payments and Purchases data
- Sales derived from delivered orders

All this data is now properly accessible via the new `db:seed` script.

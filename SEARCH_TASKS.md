# Search Experience Implementation Tasks

## Phase 1: Upstash Search Integration (HIGH PRIORITY)

### Setup & Configuration
- [x] **Set up Upstash Search account and database**
  - Create search database in Upstash console
  - Get REST URL and token
  - Add environment variables to project
  - Create "products" index

- [x] **Add Upstash Search SDK to project**
  - File: `packages/api/package.json`
  - Install: `@upstash/search`
  - Configure client in API package

- [x] **Add Mongolian fields to product schema**
  - File: `packages/api/src/db/schema.ts`
  - Add: `name_mn`, `description_mn` (optional text fields)
  - Run migration to update database

### Product Sync System
- [x] **Create product sync service**
  - File: `packages/api/src/lib/upstash-sync.ts`
  - Function: `syncProductToUpstash(product)`
  - Function: `bulkSyncProductsToUpstash(products)`
  - Handle both English and Mongolian content

- [ ] **Add Upstash sync to product mutations**
  - File: `packages/api/src/routers/admin/product.ts`
  - Sync on product create/update/delete
  - Add bulk sync endpoint for initial data load

- [x] **Create initial data sync script**
  - File: `packages/api/scripts/sync-products-to-upstash.ts`
  - Fetch all existing products
  - Bulk sync to Upstash
  - Handle rate limits and errors

### Search Endpoints
- [x] **Implement Upstash search endpoint**
  - File: `packages/api/src/routers/store/product.ts`
  - New procedure: `searchProducts`
  - Input: `{ query: string, limit?: number }`
  - Try Upstash first, fallback to Postgres
  - Return lightweight results for autocomplete

- [x] **Update getInfiniteProducts with Upstash**
  - File: `packages/api/src/routers/store/product.ts`
  - Accept search term parameter
  - Use Upstash for search, Postgres for filtering
  - Combine results for infinite scroll

---

## Phase 2: Search Overlay Components (MEDIUM PRIORITY)

### Core Components
- [x] **Create search-history.ts utility** for localStorage
  - File: `apps/storev2/src/lib/search-history.ts`
  - Functions: `getRecentSearches()`, `addSearch(term)`, `clearHistory()`
  - Store max 5 searches, include timestamp
  - Handle localStorage errors gracefully

- [x] **Build SearchOverlay component** (full-screen modal)
  - File: `apps/storev2/src/components/search/search-overlay.tsx`
  - Use existing Sheet component with `position="top"` for full-screen
  - Manage open/close state
  - Auto-focus search input when opened
  - Handle backdrop click to close

- [x] **Build SearchInput component** with clear button and loading
  - File: `apps/storev2/src/components/search/search-input.tsx`
  - Input with thick black border, neobrutalist styling
  - Clear button (X) when text present
  - Loading spinner when searching
  - Debounced onChange (300ms)
  - Auto-focus on mount

- [x] **Build SearchResults component** for quick autocomplete
  - File: `apps/storev2/src/components/search/search-results.tsx`
  - Grid of 6-8 product cards
  - Reuse existing product card styling
  - Quick "Add to cart" button
  - "See all results" link to /products?q=...

- [x] **Build SearchSuggestions component** (recent + trending)
  - File: `apps/storev2/src/components/search/search-suggestions.tsx`
  - Recent searches section (from localStorage)
  - Trending products section (placeholder for now)
  - Click to search functionality
  - Clear history option

### Integration
- [x] **Wire header search button** to open SearchOverlay
  - File: `apps/storev2/src/layouts/Header.astro`
  - Add click handler to search button
  - Import and render SearchOverlay component
  - Ensure proper client-side hydration

---

## Phase 3: Enhanced Products Page (MEDIUM PRIORITY)

### Filter System
- [x] **Update products-list.tsx** to use Upstash search
  - File: `apps/storev2/src/components/product/products-list.tsx`
  - Uncomment and use existing useSearchParam hooks
  - Pass search term to new search endpoint
  - Update queryKey to include search param for proper caching
  - Handle URL sync and navigation

- [x] **Add search input bar** to products page
  - File: `apps/storev2/src/components/product/products-list.tsx`
  - Add search input at top (below header)
  - Pre-fill from URL search param
  - Debounced search that updates URL
  - Clear button when search term present

- [x] **Build FilterBar component** with horizontal chips
  - File: `apps/storev2/src/components/search/filter-bar.tsx`
  - Horizontal scrollable filter chips
  - Show active filters with clear option
  - Sort dropdown (Newest, Price Low-High, Price High-Low)

- [ ] **Build FilterSheet component** (bottom sheet for mobile)
  - File: `apps/storev2/src/components/search/filter-sheet.tsx`
  - Use Sheet component with `position="bottom"`
  - Category filter (radio buttons or pills)
  - Brand filter (checkboxes)
  - Price range (two inputs or preset ranges)
  - Apply/Reset buttons

---

## Phase 4: Multilingual Support & Polish (LOW PRIORITY)

### Content Enhancement
- [ ] **Add Mongolian content to existing products**
  - Data entry task or migration script
  - Populate `name_mn` and `description_mn` fields
  - Prioritize top-selling products first

- [ ] **Update product forms** to include Mongolian fields**
  - Admin panel product creation/editing forms
  - Add validation for Mongolian content
  - Make Mongolian fields optional initially

### Final Touches
- [ ] **Update products page header** to show search context
  - File: `apps/storev2/src/components/product/products-list.tsx`
  - Show "X results for 'query'" when searching
  - Show "X products" when browsing all
  - Update dynamically based on filters

- [ ] **Add trending products query** for search suggestions
  - File: `packages/api/src/queries/products.ts`
  - New function: `getTrendingProducts()`
  - Logic: Most viewed/purchased in last 7 days
  - Use in SearchSuggestions component

- [ ] **Implement search analytics**
  - Track search queries and results
  - Monitor popular searches
  - Identify search gaps (no results)

---

## Implementation Order Recommendation

1. **Start with Phase 1** - Upstash setup and product sync
2. **Move to Phase 2** - Search overlay (core UX)
3. **Finish with Phase 3** - Enhanced products page
4. **Polish with Phase 4** - Multilingual support and analytics

## Testing Checklist

### Backend Testing
- [ ] Upstash search returns relevant results for English queries
- [ ] Upstash search returns relevant results for Mongolian queries
- [ ] Fallback to Postgres works when Upstash fails
- [ ] Product sync works on create/update/delete
- [ ] Bulk sync handles all existing products

### Frontend Testing
- [ ] Search overlay opens/closes properly
- [ ] Recent searches persist and clear
- [ ] Search works with English terms
- [ ] Search works with Mongolian terms
- [ ] Filters work on products page
- [ ] URL sync works (back/forward navigation)
- [ ] Mobile keyboard doesn't overlap search input
- [ ] Loading states show properly
- [ ] Empty states show helpful messages

## Files to Create/Modify

### New Files
```
packages/api/src/lib/upstash-sync.ts
packages/api/scripts/sync-products-to-upstash.ts
apps/storev2/src/lib/search-history.ts
apps/storev2/src/components/search/search-overlay.tsx
apps/storev2/src/components/search/search-input.tsx
apps/storev2/src/components/search/search-results.tsx
apps/storev2/src/components/search/search-suggestions.tsx
apps/storev2/src/components/search/filter-bar.tsx
apps/storev2/src/components/search/filter-sheet.tsx
```

### Modified Files
```
packages/api/src/db/schema.ts
packages/api/src/routers/store/product.ts
packages/api/src/routers/admin/product.ts
apps/storev2/src/layouts/Header.astro
apps/storev2/src/components/product/products-list.tsx
```

## Environment Variables to Add

```bash
# Upstash Search
UPSTASH_SEARCH_REST_URL=https://xxx.upstash.io
UPSTASH_SEARCH_REST_TOKEN=xxx
```

## Next Steps

**Start with Task 1:** Set up Upstash Search account and database

This will give you the foundation to build the entire search experience on top of a powerful, multilingual search engine.

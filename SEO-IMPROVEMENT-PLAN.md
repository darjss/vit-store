# SEO Improvement Plan — amerikvitamin.mn

> **Scope:** Code changes only in `vit-store` repo. No backlink outreach, no content writing, no off-page SEO.
> **Target:** `apps/storev2/` (storefront), `packages/api/` (tRPC + DB queries), `packages/api/src/db/schema.ts` (schema).
> **Goal:** Rank for product names (e.g. "vitamin d3", "magnesium glycinate"), brand names (e.g. "now foods", "naturebell"), and category keywords in Mongolian Google search.

---

## Context from audit findings

### What's already good (don't touch)
- Astro v5 SSR with Cloudflare adapter, TTFB 55ms
- `SEO.astro` component with OG tags, Twitter cards, Organization + WebSite schema
- Product pages have Product, Offer, Brand, BreadcrumbList JSON-LD
- Category pages have BreadcrumbList + ItemList schema
- FAQ page has FAQPage schema
- Sitemap via `@astrojs/sitemap`, robots.txt blocks AI crawlers + private pages
- Images use WebP from CDN with lazy loading + alt text
- `oldSlugs` + 301 redirect infrastructure already exists (issue #78)

### What's broken / missing
1. **Product URLs are 150-196 chars** — slug = `brand.name + name + potency + amount` slugified. Example: `a-c-grace-company-unique-e-high-delta-select-tocotrienol-concentrate-optimum-complex-for-maximum-health-benefits-tocopherol-free-60-easy-to-swallow-softgels-7187`
2. **Product `<title>` = raw English product name** — no Mongolian, no product-type keyword. Mongolian users search "витамин д3", not "tocotrienol concentrate"
3. **`name_mn`, `seoTitle`, `seoDescription` columns exist in schema but are NOT used** in storefront rendering. Product page ignores them entirely.
4. **Category slugs are transliterated Cyrillic** — `darkhlaa-demjikh` instead of `immune-support`. Not searchable.
5. **No visible breadcrumbs on product pages** — BreadcrumbList schema exists but no visual breadcrumb nav rendered (actually it IS rendered via `<Breadcrumb>` component — verify it matches schema)
6. **No `aggregateRating` / review schema** — Product schema has Offer but no ratings
7. **Sitemap `lastmod` is `new Date()` for all URLs** — all identical, Google ignores it
8. **`trailingSlash: "ignore"`** in astro.config — causes `/products` vs `/products/` duplicate canonical issues (confirmed in GSC)
9. **No `hreflang` or geo-targeting** — US gets 408 impressions with 0.2% CTR
10. **No blog/content system** — 95% of traffic is brand-name searches

### GSC data summary
- 357 clicks, 2,200 impressions (Mar 2025 – Jun 2026)
- Top queries: "amerik vitamin" (45 clicks), "америк витамин" (34), "америк витамин худалдаа" (17)
- Only 1 product page got a click from a non-brand query
- Homepage gets 73% of all clicks
- Mobile: 71% of clicks, Mongolia: 99% of clicks
- Upward trend: ~7 clicks/day in May 2026

### SERP gaps (verified via OpenSEO live SERP fetch)
- "магни глицинат" — NO Mongolian site ranks (you sell Naturebell Magnesium Glycinate)
- "витамин д3 к2" — eMonos #2, you're absent (you sell 3+ D3+K2 products)
- "коллаген хэрэглэх" — eMonos #1 with thin category page
- "пробиотик" — eMonos #1, apteka.mn #3, you're absent

---

## Phase 1: Fix product page SEO (highest impact)

### 1.1 Use `seoTitle` / `seoDescription` / `name_mn` in product page

**File:** `apps/storev2/src/pages/products/[slug].astro`

Currently line 110-113:
```ts
const seoTitle = product.name;
const seoDescription = product.description
    ? truncateAtWord(product.description, 155)
    : `${product.name} - ${product.brand?.name || "АНУ"} брэндийн витамин...`;
```

**Change to:**
```ts
const seoTitle = product.seoTitle || product.name_mn || product.name;
const seoDescription = product.seoDescription
    || (product.description ? truncateAtWord(product.description, 155) : null)
    || `${product.name_mn || product.name} - ${product.brand?.name || "АНУ"} брэндийн витамин, нэмэлт тэжээл. Америк Витамин дэлгүүрээс захиалаарай.`;
```

**Also update the `<h1>` in product-info.astro** to show `name_mn` if available, with the English name as a subtitle.

**File:** `apps/storev2/src/components/product/product-info.astro`

Currently the h1 renders `product.name`. Change to:
```astro
<h1 ...>
    {product.name_mn || product.name}
</h1>
{product.name_mn && product.name_mn !== product.name && (
    <p class="text-sm text-muted-foreground font-medium mt-1">{product.name}</p>
)}
```

**File:** `packages/api/src/queries/products/store.ts` — `getProductById` query

Add `seoTitle`, `seoDescription`, `name_mn` to the selected columns if not already returned (they're in the schema but verify the query selects them). Currently the query selects `name, slug, price, status, stock, description, discount, amount, potency, dailyIntake, categoryId, brandId, ingredients, ...` — check if `seoTitle`, `seoDescription`, `name_mn` are included. If not, add them.

### 1.2 Shorten product URL slugs

**File:** `packages/api/src/routers/admin/product.ts` (lines 144-148)

Currently:
```ts
const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
const slug = productName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
```

This produces 150+ char slugs. **Change slug generation to a short format:**

```ts
const productName = `${brand.name} ${input.name} ${input.potency} ${input.amount}`;
// Short slug: first 3 significant words from name + potency + brand prefix
const shortName = input.name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !["the", "and", "for", "with", "per", "serving"].includes(w))
    .slice(0, 4)
    .join("-");
const brandPrefix = brand.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
const slug = `${shortName}-${brandPrefix}`;
```

This produces slugs like `vitamin-d3-k2-2000-microingr` (~35 chars) instead of 196 chars.

**For existing products:** Write a one-time migration script that:
1. Reads all products from DB
2. Generates new short slugs
3. Appends current slug to `oldSlugs` array
4. Updates `slug` column
5. The existing 301 redirect infrastructure in `[slug].astro` (lines 34-42, 55-57) will automatically redirect old URLs

**Migration script location:** `apps/server/src/scripts/regenerate-slugs.ts` (new file)

### 1.3 Add `aggregateRating` placeholder to Product schema

**File:** `apps/storev2/src/pages/products/[slug].astro`

Add to `productSchema` object (after `offers`):
```ts
...(product.reviewCount > 0 && product.avgRating ? {
    aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: product.avgRating,
        reviewCount: product.reviewCount,
        bestRating: "5",
        worstRating: "1",
    }
} : {}),
```

This requires adding `reviewCount` and `avgRating` to the product query (nullable, return 0/null if no reviews). Even without a review system yet, the schema field can be added once reviews exist. **Skip this if no review data exists** — fake ratings violate Google's guidelines.

**Alternative:** Add a review system later. For now, skip aggregateRating.

### 1.4 Add Mongolian description section to product page

**File:** `apps/storev2/src/components/product/product-details.astro`

In the "description" tab, if `name_mn` exists, prepend a Mongolian summary before the English description:

```astro
{hasDescription ? (
    <div class="prose ...">
        {product.name_mn && (
            <p class="text-sm sm:text-base leading-relaxed font-bold border-b-2 border-border pb-4 mb-4">
                {product.name_mn}
            </p>
        )}
        <p class="text-sm sm:text-base leading-relaxed font-medium whitespace-pre-line">
            {product.description}
        </p>
    </div>
) : ...}
```

This requires passing `name_mn` through to `ProductDetails` component props.

---

## Phase 2: Fix category page SEO

### 2.1 Fix category slugs (transliterated → English)

**Problem:** Category slugs are transliterated Cyrillic: `darkhlaa-demjikh`, `erunkhii-vitamin-ba-nemelt`. No one searches these.

**Solution:** Update category slugs in the database to English equivalents:

| Current slug | New slug | Category name (MN) |
|---|---|---|
| `magni-ba-erdes` | `magnesium-minerals` | Магни ба Эрдэс |
| `erunkhii-vitamin-ba-nemelt` | `multivitamin-supplements` | Ерөнхий Витамин ба Нэмэлт |
| `urgamlyn-khand-ba-antioksidant` | `herbal-antioxidants` | Ургамлын Ханд ба Антиоксидант |
| `vitamin-d` | `vitamin-d` | (already OK) |
| `gedes-ba-probiotik` | `probiotics-gut-health` | Гэдэс ба Пробиотик |
| `khuukhdiin-eruul-mend` | `kids-health` | Хүүхдийн Эрүүл Мэнд |
| `emegteichuudiin-eruul-mend` | `womens-health` | Эмэгтэйчүүдийн Эрүүл Мэнд |
| `vitamin-c` | `vitamin-c` | (already OK) |
| `kollagen-ba-ue-much` | `collagen-joints` | Коллаген ба Үе Мөч |
| `omega-ba-toson-khuuril` | `omega-fatty-acids` | Омега ба Тосон Хүчил |
| `tarhi-ba-medrel` | `brain-nervous` | Тархи ба Мэдрэл |
| `eleg-ba-khorguijuulelt` | `liver-detox` | Элэг ба Хоргүйжүүлэлт |
| `vitamin-b-tsogts` | `vitamin-b-complex` | Витамин B Цогц |
| `darkhlaa-demjikh` | `immune-support` | Дархлаа Дэмжих |
| `noir-ba-taivshral` | `sleep-relaxation` | Нойр ба Тайвшрал |
| `eregteichuudiin-eruul-mend` | `mens-health` | Эрэгтэйчүүдийн Эрүүл Мэнд |
| `ars-us-khums` | `skin-hair-nails` | Арьс Үс Хумс |
| `sport-ba-amin-khuuril` | `sports-amino-acids` | Спорт ба Амин Хүчил |

**Implementation:** SQL migration or admin script. Add old slugs to a `oldSlugs` column on `CategoriesTable` (doesn't exist yet — needs schema addition + migration). Add 301 redirect in `products/category/[slug].astro` for old slugs.

**File:** `packages/api/src/db/schema.ts` — add `oldSlugs: jsonb("old_slugs").default(sql`'[]'::jsonb`).notNull()` to `CategoriesTable`.

**File:** `apps/storev2/src/pages/products/category/[slug].astro` — add redirect logic similar to product page:
```ts
if (category.oldSlugs?.includes(slug)) {
    return Astro.redirect(`/products/category/${category.slug}/1/`, 301);
}
```

Actually simpler: the `getCategoryBySlug` query should check both `slug` and `oldSlugs`. If found via oldSlug, redirect.

### 2.2 Add Mongolian SEO content to category pages

**File:** `apps/storev2/src/pages/products/category/[slug]/[page].astro`

The category page already uses `category.seoTitle`, `category.seoDescription`, `category.description` with fallbacks. The issue is these fields are likely empty in the database.

**Action:** Populate `seoTitle`, `seoDescription`, and `description` for all 18 categories via admin panel or SQL migration. Example for "Магни ба Эрдэс":
- `seoTitle`: "Магни, эрдэс бодис — АНУ-ын витамин | Америк Витамин"
- `seoDescription`: "Магни глицинат, цитрат, малтат магни зэрэг АНУ-ын шилдэг брэндүүдийн эрдэс бодис, нэмэлт тэжээл. Naturebell, Now Foods, Micro Ingredients брэндээс сонгоно уу."
- `description`: 2-3 sentences about magnesium benefits in Mongolian

**This is a data task, not a code change** — but the code already supports it. The agent should create a SQL migration script to populate these fields.

### 2.3 Add `CollectionPage` schema to category pages

**File:** `apps/storev2/src/pages/products/category/[slug]/[page].astro`

Currently has `BreadcrumbList` + `ItemList`. Add `CollectionPage` schema:
```ts
const collectionPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: category.name,
    description: seoDescription,
    url: `${SITE_URL}/products/category/${slug}/1/`,
    mainEntity: {
        "@type": "ItemList",
        numberOfItems: pagination.totalCount,
        itemListElement: products.map((p, i) => ({
            "@type": "ListItem",
            position: (page - 1) * PAGE_SIZE + i + 1,
            url: `${SITE_URL}/products/${p.slug}-${p.id}/`,
            name: p.name,
        })),
    },
};
```

Replace the separate `itemListSchema` with this combined version.

---

## Phase 3: Fix brand page SEO

### 3.1 Add brand schema and SEO fields

**File:** `apps/storev2/src/pages/products/brand/[slug]/[page].astro`

Brand pages already use `brand.seoTitle`, `brand.seoDescription`, `brand.description` with fallbacks. Same as categories — these are likely empty in DB.

**Action:** Populate `seoTitle`, `seoDescription`, `description` for top brands via SQL migration. Priority brands (by GSC impressions):
1. Nordic Naturals (5 clicks, 18 impr)
2. TruHeight (5 clicks, 13 impr)
3. Nature's Nutrition (3 clicks, 16 impr)
4. Naturewise (3 clicks, 16 impr)
5. Bronson (2 clicks, 21 impr)

**Add `Brand` schema** to brand pages:
```ts
const brandSchema = {
    "@context": "https://schema.org",
    "@type": "Brand",
    name: brand.name,
    description: brandIntro,
    url: `${SITE_URL}/products/brand/${slug}/1/`,
    ...(brandLogoUrl ? { logo: brandLogoUrl } : {}),
};
```

### 3.2 Fix brand page URL structure

Brand pages have inconsistent trailing slashes in sitemap: some `/products/brand/nordic-naturals/1/` and some `/products/brand/nordic-naturals/1`. The `trailingSlash: "ignore"` config causes this. See Phase 5.

---

## Phase 4: Fix technical issues

### 4.1 Fix trailing slash consistency

**File:** `apps/storev2/astro.config.mjs`

Currently: `trailingSlash: "ignore"` — Astro doesn't enforce trailing slashes, causing duplicate URLs.

**Change to:** `trailingSlash: "always"` — all URLs end with `/`. This fixes the `/products` vs `/products/` duplicate canonical issue from GSC.

**Verify:** All internal links already use trailing slashes (check `categoryHref`, `baseUrl`, breadcrumb links). Run `astro build` and check for errors.

### 4.2 Fix sitemap `lastmod`

**File:** `apps/storev2/astro.config.mjs`

Currently: `lastmod: new Date()` — all URLs get the same timestamp.

**Change:** Remove the static `lastmod` from the sitemap config. Astro's sitemap integration can use per-page lastmod if provided via `serialize` callback:

```ts
sitemap({
    filter: (page) => /* existing filter */,
    changefreq: "weekly",
    priority: 0.7,
    serialize(item) {
        // Don't set lastmod for all pages — let it be omitted
        // or set per-route based on the path
        if (item.url.includes("/products/") && !item.url.includes("/category/") && !item.url.includes("/brand/")) {
            // Product pages — could set based on product updatedAt
            // For now, just remove the uniform lastmod
            item.lastmod = undefined;
        }
        return item;
    },
}),
```

**Alternative simpler fix:** Just remove `lastmod: new Date()` from the config. The sitemap will omit lastmod entirely, which is better than all-identical timestamps.

### 4.3 Add geo-targeting meta tags

**File:** `apps/storev2/src/components/SEO.astro`

Add to the `extend.meta` array:
```ts
{ name: "geo.region", content: "MN" },
{ name: "geo.placename", content: "Mongolia" },
{ name: "language", content: "Mongolian" },
{ name: "distribution", content: "Mongolia" },
```

### 4.4 Add `hreflang` for Mongolian

**File:** `apps/storev2/src/components/SEO.astro`

Add to `extend.link`:
```ts
{ rel: "alternate", hreflang: "mn-MN", href: canonicalURL },
{ rel: "alternate", hreflang: "x-default", href: canonicalURL },
```

This tells Google the site is Mongolian-language, reducing irrelevant US impressions.

### 4.5 Add canonical URL with trailing slash to SEO component

**File:** `apps/storev2/src/components/SEO.astro`

Currently: `const canonicalURL = canonical || new URL(Astro.url.pathname, SITE_URL).toString();`

This may produce URLs without trailing slash. After changing `trailingSlash: "always"`, verify canonical URLs end with `/`. If not, add:
```ts
let canonicalURL = canonical || new URL(Astro.url.pathname, SITE_URL).toString();
if (!canonicalURL.endsWith("/")) canonicalURL += "/";
```

---

## Phase 5: Add blog infrastructure (for content SEO)

### 5.1 Create blog content collection

**File:** `apps/storev2/src/content/blog/` (new directory)
**File:** `apps/storev2/src/content.config.ts` (new file)

```ts
import { glob } from "astro/loaders";
import { defineCollection, z } from "astro:content";

const blog = defineCollection({
    loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
    schema: z.object({
        title: z.string(),
        description: z.string(),
        pubDate: z.coerce.date(),
        updatedDate: z.coerce.date().optional(),
        category: z.string().optional(),
        tags: z.array(z.string()).default([]),
        image: z.string().optional(),
    }),
});

export const collections = { blog };
```

### 5.2 Create blog page routes

**File:** `apps/storev2/src/pages/blog/index.astro` (new)
- List all blog posts with titles, dates, excerpts
- SEO: title "Витамин, эрүүл мэндийн мэдээлэл | Америк Витамин", description about health articles

**File:** `apps/storev2/src/pages/blog/[slug].astro` (new)
- Render individual blog post from content collection
- SEO: Article schema with publishedTime, modifiedTime, author = "Америк Витамин"
- Add `article` prop to `<Layout>` / `<SEO>` component

### 5.3 Add blog to sitemap and navigation

**File:** `apps/storev2/astro.config.mjs` — remove `/blog` from sitemap filter if it's being filtered (it shouldn't be, but verify)

**File:** `apps/storev2/src/layouts/Header.astro` — add "Блог" link in navigation

### 5.4 Add blog link in footer

**File:** `apps/storev2/src/layouts/Footer.astro`

Add a "Блог" or "Эрүүл мэндийн мэдээлэл" link in the footer services section.

---

## Phase 6: Product page FAQ schema (per-product)

### 6.1 Add FAQ section to product pages

**File:** `apps/storev2/src/components/product/product-details.astro`

Add a 5th tab "Асуулт" (FAQ) with 3-5 generic product questions in Mongolian:
- "Энэ бүтээгдэхүүнийг хэрхэн хэрэглэх вэ?" (How to use?)
- "Хэзээ уух вэ?" (When to take?)
- "Ямар гаж нөлөө байж болох вэ?" (Side effects?)
- "Жирэмсэн үед хэрэглэж болох уу?" (Safe during pregnancy?)
- "Хаанаас захиалах вэ?" (Where to order?)

These can be generated from product data (dailyIntake, category, etc.) or use category-specific templates.

### 6.2 Add FAQPage schema for product pages

**File:** `apps/storev2/src/pages/products/[slug].astro`

Add a `faqSchema` with the same Q&A pairs:
```ts
const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
        { "@type": "Question", name: "...", acceptedAnswer: { "@type": "Answer", text: "..." } },
        // ...
    ],
};
```

Render with `<script type="application/ld+json" set:html={JSON.stringify(faqSchema)} />`.

---

## Phase 7: Internal linking improvements

### 7.1 Add "related searches" / "popular categories" section to product pages

**File:** `apps/storev2/src/pages/products/[slug].astro`

Below the recommended products section, add a text-based "Төстэй хайлтууд" (Related searches) section with links to category and brand pages:

```html
<div class="border-t-4 border-border pt-8 pb-8">
    <h2 class="text-xl font-black mb-4 uppercase">Төстэй ангилал</h2>
    <div class="flex flex-wrap gap-2">
        <a href="/products/category/vitamin-d/1/" class="border-2 border-border px-3 py-1.5 text-sm font-bold hover:bg-primary">Витамин D</a>
        <a href="/products/brand/micro-ingredients/1/" class="border-2 border-border px-3 py-1.5 text-sm font-bold hover:bg-primary">Micro Ingredients</a>
    </div>
</div>
```

This creates internal links with keyword-rich anchor text.

### 7.2 Add keyword-rich text to products index page

**File:** `apps/storev2/src/pages/products/index.astro`

Add an intro section at the bottom of the page with Mongolian text about vitamin categories, brands, and usage. This adds crawlable keyword content to the main products page (which gets 284 impressions but only 2.8% CTR).

---

## Phase 8: Performance & crawlability

### 8.1 Add `Cache-Control` headers for static assets

**File:** `apps/storev2/src/middleware.ts` or Cloudflare config

Ensure CSS/JS/images have long `Cache-Control: public, max-age=31536000, immutable` headers.

### 8.2 Preload critical resources

**File:** `apps/storev2/src/layouts/Layout.astro`

Add `<link rel="preload">` for the primary font and hero image.

---

## Implementation priority

| Priority | Phase | Effort | Impact |
|---|---|---|---|
| P0 | 1.1 — Use seoTitle/name_mn in product pages | Small | High — immediately improves titles for all products |
| P0 | 1.2 — Shorten product slugs | Medium | High — fixes URL truncation, improves CTR |
| P0 | 4.1 — Fix trailingSlash to "always" | Small | High — fixes duplicate canonical |
| P1 | 2.1 — Fix category slugs to English | Medium | High — makes category URLs searchable |
| P1 | 2.2 — Populate category SEO fields | Medium | High — category pages can rank for keywords |
| P1 | 3.1 — Populate brand SEO fields | Medium | Medium — brand pages already get some traffic |
| P1 | 4.4 — Add hreflang + geo tags | Small | Medium — reduces irrelevant US impressions |
| P1 | 4.2 — Fix sitemap lastmod | Small | Low-Medium |
| P2 | 5.1-5.4 — Blog infrastructure | Medium | High (long-term) — captures top-of-funnel queries |
| P2 | 6.1-6.2 — Product FAQ schema | Medium | Medium — FAQ rich results in SERP |
| P2 | 7.1-7.2 — Internal linking | Small | Medium |
| P3 | 8.1-8.3 — Performance tweaks | Small | Low |
| P3 | 2.3 — CollectionPage schema | Small | Low |
| P3 | 3.2 — Brand schema | Small | Low |

---

## Key files to modify

| File | Changes |
|---|---|
| `apps/storev2/src/pages/products/[slug].astro` | Use seoTitle/seoDescription/name_mn, add FAQ schema, add related searches section |
| `apps/storev2/src/components/product/product-info.astro` | Show name_mn as h1, English name as subtitle |
| `apps/storev2/src/components/product/product-details.astro` | Add Mongolian description section, add FAQ tab |
| `apps/storev2/src/components/SEO.astro` | Add geo tags, hreflang, trailing slash canonical fix |
| `apps/storev2/astro.config.mjs` | trailingSlash: "always", fix sitemap lastmod |
| `apps/storev2/src/pages/products/category/[slug]/[page].astro` | Add CollectionPage schema, old-slug redirect |
| `apps/storev2/src/pages/products/brand/[slug]/[page].astro` | Add Brand schema |
| `apps/storev2/src/pages/products/index.astro` | Add keyword-rich intro text |
| `apps/storev2/src/pages/blog/index.astro` | New — blog listing page |
| `apps/storev2/src/pages/blog/[slug].astro` | New — blog post page |
| `apps/storev2/src/content.config.ts` | New — blog content collection |
| `apps/storev2/src/layouts/Header.astro` | Add blog nav link |
| `apps/storev2/src/layouts/Footer.astro` | Add blog footer link |
| `packages/api/src/db/schema.ts` | Add oldSlugs to CategoriesTable |
| `packages/api/src/queries/products/store.ts` | Ensure seoTitle/seoDescription/name_mn in getProductById |
| `packages/api/src/routers/admin/product.ts` | Shorten slug generation logic |
| `apps/server/src/scripts/regenerate-slugs.ts` | New — one-time slug migration |
| `apps/server/src/scripts/populate-category-seo.ts` | New — populate category SEO fields |
| `apps/server/src/scripts/populate-brand-seo.ts` | New — populate brand SEO fields |

---

## Verification

After each phase:
1. Run `astro check` in `apps/storev2/` — no type errors
2. Run `astro build` — build succeeds
3. Deploy to dev/staging and verify:
   - Product page `<title>` shows Mongolian name (if name_mn set)
   - Product URL is under 80 chars
   - `/products` redirects to `/products/`
   - Sitemap URLs all have trailing slashes
   - Category pages show English slugs
   - Blog page renders at `/blog/`
   - View page source — JSON-LD schemas are valid (test with Google Rich Results Test)
4. Submit updated sitemap to Google Search Console
5. Monitor GSC for 1-2 weeks — expect increase in impressions for product/category keywords

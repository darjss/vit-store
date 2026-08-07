# Search Engine Improvement — Handoff Brief

Owner-approved implementation handoff from deploy/QA orchestrator to loc/curation orchestrator, 2026-07-07.
Status: **FINAL — implementation may start.** §6 contains the dosage/short-token findings; its fix map is part of the approved scope.

## 0. Ground rules

- Branch off `v2`, PR into `v2`. Isolated worktree only — never the main checkout.
- The storefront search **UX** is a separate in-flight PR (feat/search-reimagine, apps/storev2 search components + Header) — engine work must stay out of those files. Engine surface: `packages/api/src/lib/product-search/{core,text,types,db}.ts`, the DO `apps/server/src/durable-objects/product-search-object.ts`, procedure `packages/api/src/routers/store/product.ts`, analytics `apps/storev2/src/lib/analytics.ts` + `search-results.tsx` capture calls (coordinate with the UX branch if search-results.tsx conflicts — the analytics change is small).
- Cloudflare AI Search is DEAD as a direction (bge-m3 Mongolian recall tested BAD). MiniSearch stays the engine.
- No inline comments; biome tabs/double quotes; keep the guard rails: the DO snapshot format and the 4000ms client timeout stay unless there's a reason.

## 1. Current engine (verified map)

- UI: `SearchOverlay` → `search-input.tsx` (300ms debounce) → tRPC `product.searchStorefrontWithStock` (limit 8).
- Procedure: `packages/api/src/routers/store/product.ts` → `performCatalogSearch` → `product-search/client.ts` → `PRODUCT_SEARCH` DO (`getByName`), `PRODUCT_SEARCH_TIMEOUT_MS = 4000` Promise.race.
- Engine: MiniSearch in-memory in the DO; snapshot chunked 64KB into DO storage; rebuilt from Postgres on cold start or admin `/sync-upstash` (legacy name) route.
- Ranking (`core.ts`): lexical, `prefix: true`, `fuzzy: 0.2` for terms ≥4 chars; fields name / nameMn / nameWithBrand / nameMnWithBrand + brand/category alias fields; custom scoring with in-stock boost, out-of-stock −500.
- Stock filter: `routers/store/product.ts:97` — `requireStock` hard-drops OOS products from results entirely.
- Alias layer: `text.ts` — `CYRILLIC_TO_LATIN` transliteration + `LATIN_SEARCH_ALIASES` with only **10 entries** (magnesium, vitamin, zinc, omega, probiotic, collagen, calcium, iron, fish, oil), line ~41.

## 2. Evidence: PostHog (90 days, project 262338, us.posthog.com)

Instrumentation exists: `search_performed {query, results_count}` (fires per keystroke — inflates data), `search_result_clicked {query, product_id, product_name, position}`. Admin `analytics.getTopSearches` reads PostHog directly; there is no server-side query log.

- Volume: 15,673 pageviews / 3,517 people vs 1,561 search events / 255 people → **~7% of visitors search**; 255 searchers → 120 clickers (47%), 166 clicks. Minority behavior, high intent.
- **Zero-result share 18.2%** (284/1561) — inflated by mid-typing prefixes but directionally bad.
- Top real terms: vitamin d (29), omega 3 (23), inositol (22), zinc (20), magnesium (18), Магний (12), Витамин c (11), collagen (10), coq10, berberine, selenium, boric, betaine, blackmores, ashwagandha, turmeric, myo-inositol.
- Top zero-result complete terms: **creatine** family (~37 combined), ahcc (5), blackmores/blackmore (7), reishi, rhodiola, tudca-misspellings, pumpkin, menstrual/менст, inositol misspellings (inofa/inof/inosto), Гиалари (hyaluron), Гиул.

## 3. Evidence: prod dogfood (42 queries)

Works well (GOOD): vitamin d / витамин д, omega 3 / омега 3 / fish oil, zinc/цайр, magnesium/Магний/магни, collagen/коллаген, кальци, мелатонин, пробиотик, inositol, biotin, NOW (brand facet), symptom queries нойргүйдэл→melatonin/5-HTP, дархлаа→zinc/probiotics, үе мөж→glucosamine.

Failures:
| Query | Result | Mechanism |
|---|---|---|
| creatine / creatin | 1 hit: "Silverpeaks Height Growth" (irrelevant) | loose fuzzy, no min-score floor, catalog gap |
| rhodiola | 1 hit: Ashwagandha/Ginseng | same |
| ядаргаа (fatigue) | 1 | symptom tags missing on products |
| boric / betaine / ahcc | 0 | catalog gap / OOS hard-dropped (betaine had results before going OOS) |
| blackmores | 0 | brand not carried/indexed |
| reishi / menstrual | 0 | real demand, catalog/tag gap |
| selenium | 2 (combos only) | thin catalog |

## 4. Approved plan — Phase A (quick wins, one PR)

1. **Minimum relevance floor** in `scoreSearchResult`/`searchMiniSearchIndex`: a lone sub-threshold fuzzy hit returns an honest EMPTY instead of one irrelevant product. Calibrate so creatine→HeightGrowth and rhodiola→Ashwagandha die while legitimate thin results (pumpkin→seed oil, selenium combos) survive.
2. **Tighten fuzzy**: 0.2 → ~0.15 and/or gate fuzzy to terms ≥5 chars. Validate against the GOOD list above — none may regress (include a before/after table in the PR).
3. **Alias/synonym expansion** in `text.ts`: 10 → ~50 entries sourced from observed misses: blackmores/blackmore, tudca/tudka, creatine/creatin/kreatin, the inositol misspelling family (inofa/inof/inosto), reishi, ahcc, boric, Гиалари→hyaluronic, Гиул, rhodiola, ashwagandha spellings, plus dosage/brand entries pending §6.
4. **Analytics capture fix** (storefront): emit `search_performed` only for the settled query (after debounce + a short idle, or on results-render of a query the user stopped typing), add `zero_result: boolean` property. Keep `search_result_clicked` as-is. Coordinate the `search-results.tsx` touch with the in-flight UX branch.

## 5. Approved plan — Phase B (same PR or follow-up)

**Curated symptom→ingredient map** (MN + EN), replacing reliance on per-product manual tags: at minimum ядаргаа/fatigue → B-complex/B12/iron/coq10/ashwagandha; menstrual/менст → magnesium/B6/iron/evening-primrose; sleep/нойр; immunity/дархлаа; joints/үе мөч (the last two work today via tags — the map should make them tag-independent). Implement as a data table in the alias layer feeding query expansion, not as product-row tags. Keep it a plain reviewable constant.

## 6. Dosage/short-token smoke tests — FINDINGS (30 queries, 3 warm runs each)

Owner-reported: "naturebell d 10000" and "d 10000" unreliable. Ground truth: target product "Naturebell, D3 + K2, 10,000 IU D3 & 200 mcg K2, 240 Softgels" (active, stock 3); brand stored as "Naturebell" (one word). Decisive contrast: `10,000 iu` (comma) → target #2, GOOD; `10000 iu` (how users type) → 2 garbage rows.

### Root causes (file:line verified)

**(a) Number tokenization — THE primary bug.** `normalizeSearchText` (text.ts:58) strips commas to spaces, and MiniSearch's default tokenizer splits on punctuation, so `"10,000 IU"` in product names indexes as tokens `10` + `000` — never `10000`. A user query `10000` is one token matching neither, not by prefix, not by fuzzy. **Every no-comma dosage query fails; every comma query works.**

**(b) Short tokens.** No minimum term length; `prefix: true` makes 1-char tokens (`d`, `c`) match everything; fuzzy off below length 4. `d3`/`k2`/`б12` are fine; bare `d`/`c`/`d 3` degrade to match-everything-rank-by-stock.

**(c) AND→OR collapse + stock-dominated ranking.** core.ts:321-328: combineWith AND first; if AND returns 0, silently falls back to OR — so one unmatchable token (`10000`) swaps the whole result set (`d3` alone = 8 correct; `d3 10000` = 2 garbage). And scoreSearchResult (core.ts:198-268) adds up to +240 stock weight (log1p(stock)*45) — the exact 10,000 IU match (stock 3) is buried under 50,000 IU (stock 16) and 5,000 IU (stock 50) purely on inventory.

**(d) Brand bridging.** `nature bell` (two tokens) prefix-matches Nature's Plus above Naturebell; no brand canonicalization/space-collapsing; brand match is a weak signal, not a filter.

**(e) The "not reliably" part — cold-start + broken fallback.** Warm results are deterministic (byte-identical across runs; single named DO). But a cold DO rebuild can exceed the 4000ms client timeout (client.ts:19,38-45) which swallows to `[]` — first search after idle shows brand chip "Naturebell (36)" with an EMPTY product list. The DB fallback that should rescue this (store.ts:342-345,379-382) uses case-sensitive `LIKE` against the WHOLE query string — `'%naturebell d 10000%'` can never match and lowercase `naturebell` never matches stored `Naturebell`. The safety net is dead.

### §6 fix map (approved scope, ranked)

1. **Number normalization at index+query time**: custom tokenize/processTerm (or extend normalizeSearchText) emitting comma-stripped digit tokens so `10,000` and `10000` both produce `10000` (keep split forms as aliases). Symmetric docs+queries. Kills the whole failure class.
2. **No collapse on unmatchable tokens**: drop zero-posting tokens before AND combine (or per-term weighting) so `d3 10000` still ranks the d3 set instead of swapping to OR garbage.
3. **Exact dosage beats stock**: dominant boost for exact amount/potency match; cap stock weight to tiebreaker level.
4. **Short-token handling**: bare vitamin letters (`d`, `c`, `b`) expand as vitamin synonyms (`d`→vitamin d/d3) instead of raw prefix wildcards; min-length or co-occurrence rule for 1-char tokens.
5. **Brand canonicalization**: space/case-collapse brand tokens (`nature bell`→`naturebell`); recognized brand = hard-ish filter or dominant boost.
6. **Reliability**: DB fallback → `ILIKE` per-token AND (not whole-string case-sensitive LIKE); plus keep the DO warm (alarm/ping) or serve stale snapshot / raise the 4s timeout so post-idle first search isn't empty.

Full smoke table with all 30 queries lives in the QA transcript; the acceptance table in §8 must include: naturebell d 10000 (target in top 3), d 10000, 10000 iu, d3 10000, nature bell (Naturebell #1), c 1000, and a cold-start simulation (fallback returns brand matches).

## 7. Out of scope (tracked elsewhere)

- Search UX (in-flight PR on my side).
- Inventory gaps (creatine/reishi/ahcc/Blackmores stocking) — owner/merch decision, top ROI of the whole report.
- Did-you-mean suggestions, MN suffix stemming, admin zero-result dashboard — post-launch backlog.
- 7% search usage → conversion instrumentation beyond the zero_result flag.

## 8. Acceptance

- Before/after table for every query in §2/§3/§6 (GOOD must stay GOOD, failures must improve or become honest empties).
- No change to public procedure shape or DO snapshot format without flagging.
- `astro check` + typecheck + lint clean; PR into v2 with the evidence tables in the body.

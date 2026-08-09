# Upstash Redis Search owns product retrieval

Upstash Redis Search is the sole product-search engine for the storefront, admin, and customer agent. PostgreSQL remains the product source of truth, while each rebuild writes a complete versioned search generation and switches the active generation only after Upstash confirms the full catalog was indexed.

We removed the global MiniSearch Durable Object and the database name-search fallback because they maintained different ranking rules and hid search failures as empty results. Search now fails clearly when Upstash is unavailable, requires every meaningful query token, and keeps old generations hidden during rebuilds.

For normal product queries, text determines which products qualify, then a bounded rank made from 90-day PostHog demand and stock bands orders those products. Raw stock quantity never controls rank. Symptom searches keep text relevance because their intent boosts carry more meaning than global sales demand. Ranking signals are cached in Redis for six hours so stock rebuilds do not depend on a live PostHog request.

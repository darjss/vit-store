# R2-backed photo identification for Messenger

Inbound customer photos will be fetched by trusted channel code, stored under a short-lived `messenger-inbound/` R2 prefix, and passed to the agent as an R2 key rather than as a Meta CDN URL or base64 session payload. The image-identification tool reads the R2 object, calls the vision model, and returns text facts to the agent session. This keeps webhook acknowledgement fast, avoids expiring provider URLs and durable-session image bloat, and preserves a short debug window via an R2 lifecycle rule.

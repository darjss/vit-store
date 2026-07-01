# Admin Messenger agent via Codemode

A second Flue agent (`admin-assistant`) will live in the existing `apps/agent`
Worker alongside the customer agent. The Messenger webhook inspects the sender
PSID against an `ADMIN_PSIDS` env-var allowlist and dispatches to the admin
agent for allowlisted IDs, falling through to the customer agent for everyone
else. One Worker, one webhook, one admission store, two agent definitions with
separate Durable Object classes, instruction sets, and tool arrays.

The admin agent has **one tool**: `query({ code: string })` wrapping Cloudflare's
`DynamicWorkerExecutor` (`@cloudflare/codemode`). The model returns a formatted
string from the snippet and Flue delivers it as the single Messenger reply for
the turn. Multi-message delivery and pagination are handled via follow-up turns
(admin says "next" → model calls fn with `page: 2`), not via extra tools. If
multi-message delivery becomes a real pain during testing, `post_message` (the
same `defineTool` the customer agent uses) can be added as a second tool later.

The model writes TypeScript
that calls `codemode.*` fns — typed RPC targets routed back to the host Worker,
which calls the admin tRPC router over HTTP. This is the "DIY Codemode" shape:
Flue `defineTool` around `DynamicWorkerExecutor.execute(code, fns)`, not the
AI-SDK `createCodeTool` (Flue has no AI-SDK tool adapter). The sandbox runs with
`globalOutbound: null` (no `fetch()`) and a 120s timeout. Every fn is a thin
tRPC pass-through — the sandbox never touches the DB, images, or network
directly.

All business-data admin tRPC procedures (order, product, customer, payment,
sales, analytics, purchase, brands, category, image, ai-product, ai-purchase)
are re-exported under a new `botProcedure` (header-token auth via
`X-Admin-Bot-Token`, not cookie session). The auth router (session/user
management) is excluded — the bot manages store data, not admin accounts. Soft
deletes on every entity mean the fn surface is safe to expose in full; the
sandbox can't do irreversible damage because no fn does hard deletes.

To avoid duplicating resolver logic while preserving full tRPC type safety,
each admin router file is refactored to a **factory parameter** pattern: the
router accepts its procedure type as a parameter (`buildOrderRouter(proc)`),
and is called once with `adminProcedure` (existing, unchanged) and once with
`botProcedure` (new). A shared `baseProcedure` (error handling + logging)
derives both `adminProcedure` and `botProcedure`, differing only in the auth
middleware. No business-data resolver reads `ctx.session`, so the auth swap is
transparent to the resolver logic. The `botRouter` is a fully typed tRPC router
(`type BotRouter = typeof botRouter`) — the Codemode fn registry in
`@vit/assistant` imports `BotRouter` and gets end-to-end type inference.

The admin agent uses `cloudflare/@cf/moonshotai/kimi-k2.7-code` (code-optimized
variant, released June 2026) at `thinkingLevel: "medium"`. The customer agent
stays on `kimi-k2.6`. Instructions require soft confirmation before bulk writes
and before any delete, even though deletes are reversible.

Agent logic (Codemode tool builder, fn registry, instructions) lives in
`packages/assistant/src/admin/` per the established customer-agent pattern
(ADR 0002). The agent module in `apps/agent/src/agents/admin-assistant.ts` is
thin — it assembles the tool and returns the runtime config.

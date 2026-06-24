# Agent app plus shared assistant package

We will add a deployable Flue app for agent runtime surfaces and a shared assistant package for reusable assistant domain code. The app owns Flue configuration, Messenger channels, Durable Object migrations, and Cloudflare bindings; the package owns shared prompts, tool builders, product-card formatting, and delivery-zone resolver code. This keeps the Messenger bot deployable while preserving reuse for the future storefront AI widget.

# Direct tools for the customer agent

The customer-facing Messenger agent will use normal Flue `defineTool` tools for v1 rather than Codemode. The bot has a small, interactive tool surface where most calls lead to customer-facing confirmations, so direct tools are easier to debug and keep the first Flue integration smaller. Codemode remains a candidate for the separate delivery-zone resolver evaluation and the future admin Messenger agent, where tool count and multi-call orchestration are expected to be much higher.

export { buildAdminQueryTool } from "./codemode-tool";
export { adminAssistantInstructions } from "./instructions";
export { buildReadFns } from "./read-fns";

// Kimi code model — tuned for code generation (Codemode). Same Workers AI
// binding as the customer agent, no API key.
export const ADMIN_ASSISTANT_MODEL = "cloudflare/@cf/moonshotai/kimi-k2.7-code";

export { buildAdminQueryTool } from "./codemode-tool";
export { adminAssistantInstructions } from "./instructions";
export { buildReadFns } from "./read-fns";

// Same model as the customer assistant — proven reliable with tool calling
// (post_messenger_message). The kimi-k2.7-code variant was skipping
// post_messenger_message calls, producing text without delivering replies.
export const ADMIN_ASSISTANT_MODEL = "cloudflare/@cf/moonshotai/kimi-k2.6";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const opencode = createOpenAICompatible({
	baseURL: "https://opencode.ai/zen/go/v1",
	apiKey: process.env.OPENCODE_GO_API_KEY,
	name: "opencode-go",
	supportsStructuredOutputs: true,
});

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const opencode = createOpenAICompatible({
	apiKey: process.env.OPENCODE_GO_API_KEY,
	baseURL: "https://opencode.ai/zen/go/v1",
	name: "opencode-go",
	supportsStructuredOutputs: true,
});

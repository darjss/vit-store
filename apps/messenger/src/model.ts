import { createOpenAI } from "@ai-sdk/openai";
import type { Env } from "./env";

// The spike speaks OpenAI-compatible chat completions; CLIProxyAPI serves that
// shape locally at OPENAI_BASE_URL. Reasoning is off: chat models accept
// reasoningEffort "none" in @ai-sdk/openai 3.0.117.
export const createModel = (env: Env) =>
	createOpenAI({
		apiKey: env.OPENAI_API_KEY,
		baseURL: env.OPENAI_BASE_URL,
	}).chat(env.MODEL ?? "gpt-6-luna");

export const modelName = (env: Env): string => env.MODEL ?? "gpt-6-luna";

export const providerOptions = {
	openai: { reasoningEffort: "none" },
} as const;

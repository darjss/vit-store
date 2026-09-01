import * as v from "valibot";

const contentPartSchema = v.object({ text: v.optional(v.string()) });

export const aiResponseSchema = v.union([
	v.string(),
	v.object({
		choices: v.optional(
			v.array(
				v.object({
					message: v.optional(
						v.object({
							content: v.union([v.string(), v.array(contentPartSchema)]),
						}),
					),
				}),
			),
		),
		response: v.optional(v.string()),
		result: v.optional(v.object({ response: v.optional(v.string()) })),
	}),
]);

export type AiResponse = v.InferOutput<typeof aiResponseSchema>;

export function formatAiResponseText(parsed: AiResponse): string {
	if (v.is(v.string(), parsed)) {
		return parsed;
	}
	if (parsed.response) {
		return parsed.response;
	}
	const message = parsed.choices?.[0]?.message;
	const content = message?.content;
	if (v.is(v.string(), content)) {
		return content;
	}
	if (v.is(v.array(contentPartSchema), content)) {
		return content.map((part) => part.text ?? "").join("");
	}
	if (parsed.result?.response) {
		return parsed.result.response;
	}
	return JSON.stringify(parsed);
}

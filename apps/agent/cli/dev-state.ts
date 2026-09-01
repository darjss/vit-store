import * as v from "valibot";

export const devButtonSchema = v.object({
	kind: v.picklist(["postback", "quick_reply", "url"]),
	title: v.string(),
	value: v.string(),
});

export const devStateSchema = v.object({
	current: v.string(),
	inboundSeq: v.number(),
	lastButtons: v.array(devButtonSchema),
	sessions: v.record(v.string(), v.object({ psid: v.string() })),
});

export type DevButton = v.InferOutput<typeof devButtonSchema>;
export type DevState = v.InferOutput<typeof devStateSchema>;

export const IMAGE_CONTENT_TYPE_BY_EXT = {
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
} as const satisfies Record<string, string>;

const seedNodeSchema = v.object({
	content: v.optional(v.string()),
	from: v.optional(v.union([v.string(), v.number()])),
	message: v.optional(v.string()),
	role: v.optional(v.string()),
	sender: v.optional(v.union([v.string(), v.number()])),
	text: v.optional(v.string()),
});

type JsonArray = Array<JsonValue>;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonArray | JsonObject | boolean | null | number | string;

const jsonValueSchema: v.GenericSchema<JsonValue> = v.lazy(() =>
	v.union([
		v.null(),
		v.boolean(),
		v.number(),
		v.string(),
		v.array(jsonValueSchema),
		v.record(v.string(), jsonValueSchema),
	]),
);

export function parseSeedFile(raw: string): JsonValue {
	return v.parse(jsonValueSchema, JSON.parse(raw));
}

export function extractSeedTexts(data: JsonValue): Array<string> {
	const out: Array<string> = [];
	const visit = (node: JsonValue) => {
		if (v.is(v.array(jsonValueSchema), node)) {
			for (const item of node) {
				visit(item);
			}
			return;
		}
		if (v.is(v.record(v.string(), jsonValueSchema), node)) {
			const parsed = v.safeParse(seedNodeSchema, node);
			if (parsed.success) {
				const text = parsed.output.content ?? parsed.output.text ?? parsed.output.message ?? "";
				const sender = String(
					parsed.output.from ?? parsed.output.sender ?? parsed.output.role ?? "",
				).toLowerCase();
				const isCustomer =
					sender.includes("customer") || sender.includes("user") || sender.includes("human");
				if (text && (isCustomer || sender === "")) {
					out.push(text);
				}
			}
			for (const value of Object.values(node)) {
				visit(value);
			}
		}
	};
	visit(data);
	return out.slice(0, 25);
}

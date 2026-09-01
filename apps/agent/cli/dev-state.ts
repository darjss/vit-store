import {
	array,
	boolean,
	type GenericSchema,
	InferOutput,
	is,
	lazy,
	null as nullSchema,
	number,
	object,
	optional,
	parse,
	picklist,
	record,
	safeParse,
	string,
	union,
} from "valibot";

export const devButtonSchema = object({
	kind: picklist(["postback", "quick_reply", "url"]),
	title: string(),
	value: string(),
});

export const devStateSchema = object({
	current: string(),
	inboundSeq: number(),
	lastButtons: array(devButtonSchema),
	sessions: record(string(), object({ psid: string() })),
});

export type DevButton = InferOutput<typeof devButtonSchema>;
export type DevState = InferOutput<typeof devStateSchema>;

export const IMAGE_CONTENT_TYPE_BY_EXT = {
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
} as const satisfies Record<string, string>;

const seedNodeSchema = object({
	content: optional(string()),
	from: optional(union([string(), number()])),
	message: optional(string()),
	role: optional(string()),
	sender: optional(union([string(), number()])),
	text: optional(string()),
});

type JsonArray = Array<JsonValue>;
type JsonObject = { [key: string]: JsonValue };
type JsonValue = JsonArray | JsonObject | boolean | null | number | string;

const jsonValueSchema: GenericSchema<JsonValue> = lazy(() =>
	union([
		nullSchema(),
		boolean(),
		number(),
		string(),
		array(jsonValueSchema),
		record(string(), jsonValueSchema),
	]),
);

export function parseSeedFile(raw: string): JsonValue {
	return parse(jsonValueSchema, JSON.parse(raw));
}

function tryCollectSeedText(node: JsonObject, out: Array<string>) {
	const parsed = safeParse(seedNodeSchema, node);
	if (!parsed.success) {
		return;
	}
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

function visitSeedJson(node: JsonValue, out: Array<string>) {
	if (is(array(jsonValueSchema), node)) {
		for (const item of node) {
			visitSeedJson(item, out);
		}
		return;
	}
	if (is(record(string(), jsonValueSchema), node)) {
		tryCollectSeedText(node, out);
		for (const value of Object.values(node)) {
			visitSeedJson(value, out);
		}
	}
}

export function extractSeedTexts(data: JsonValue): Array<string> {
	const out: Array<string> = [];
	visitSeedJson(data, out);
	return out.slice(0, 25);
}

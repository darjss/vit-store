import { valibotSchema } from "@ai-sdk/valibot";
import { tool } from "ai";
import * as v from "valibot";
import addProduct from "./skills/add-product.md";
import invoicePurchase from "./skills/invoice-purchase.md";
import lookupOrders from "./skills/lookup-orders.md";
import messengerOrder from "./skills/messenger-order.md";
import namedZoneShip from "./skills/named-zone-ship.md";
import stockPaste from "./skills/stock-paste.md";
import storeAnalytics from "./skills/store-analytics.md";

// The seven admin skills, shipped as Worker Text modules and surfaced to the
// model through a name + description index plus the load_skill tool — the same
// loading contract Flue provided.
interface Skill {
	body: string;
	description: string;
	name: string;
}

// Minimal YAML front-matter reader for `name:` and `description:` (supports
// the `>-`/`>` folded style the skill files use).
const parseSkill = (raw: string): Skill => {
	const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
	if (match === null) {
		return { body: raw, description: "", name: "" };
	}
	const [, frontMatter, body] = match;
	const fields = new Map<string, string>();
	let current: string | undefined;
	for (const line of frontMatter.split("\n")) {
		const field = /^(\w[\w-]*):\s*(.*)$/.exec(line);
		if (field !== null && !/^\s/.test(line)) {
			current = field[1];
			const value = field[2] ?? "";
			fields.set(current, value === ">-" || value === ">" ? "" : value);
			continue;
		}
		if (current !== undefined) {
			fields.set(current, `${fields.get(current) ?? ""} ${line.trim()}`.trim());
		}
	}
	return {
		body: body.trim(),
		description: fields.get("description") ?? "",
		name: fields.get("name") ?? "",
	};
};

const skills: ReadonlyMap<string, Skill> = new Map(
	[
		addProduct,
		stockPaste,
		lookupOrders,
		namedZoneShip,
		invoicePurchase,
		storeAnalytics,
		messengerOrder,
	]
		.map(parseSkill)
		.map((skill) => [skill.name, skill]),
);

export const skillsIndex = (): string =>
	[...skills.values()].map((skill) => `- ${skill.name}: ${skill.description}`).join("\n");

export const loadSkillTool = () =>
	tool({
		description:
			"Load a specialized admin skill by name and follow its steps. Names: add-product, stock-paste, lookup-orders, named-zone-ship, invoice-purchase, store-analytics, messenger-order.",
		execute: async ({ name }) => {
			const skill = skills.get(name.trim());
			if (skill === undefined) {
				return { error: `Unknown skill: ${name}`, ok: false };
			}
			return { body: skill.body, name: skill.name, ok: true };
		},
		inputSchema: valibotSchema(v.object({ name: v.pipe(v.string(), v.minLength(1)) })),
	});

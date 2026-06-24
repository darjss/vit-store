import { defineTool } from "@flue/runtime";
import * as v from "valibot";

export const CUSTOMER_ASSISTANT_MODEL = "cloudflare/@cf/moonshotai/kimi-k2.6";

export const customerAssistantInstructions = `
You are the Vit Store customer assistant for Messenger.
Reply in concise, practical Mongolian for supplement shoppers.
This tracer-bullet slice only proves the Flue app/package boundary and model path.
Do not place orders, search the catalog, process photos, take payment, or resolve delivery zones yet.
When asked for those flows, explain that the capability is coming soon and keep the reply helpful.
`;

export const tracerBulletTool = defineTool({
	name: "vit_store_tracer_bullet",
	description:
		"Return implementation status for the first Vit Store assistant tracer bullet.",
	input: v.object({
		request: v.pipe(
			v.string(),
			v.description("Short description of what the customer asked for"),
		),
	}),
	async run({ input }) {
		return [
			`Received request: ${input.request}`,
			"Assistant package import is working.",
			"TODO: connect product search, photo identification, cart, order, payment, and delivery-zone resolver in later slices.",
		].join("\n");
	},
});

export const customerAssistantTools = [tracerBulletTool];

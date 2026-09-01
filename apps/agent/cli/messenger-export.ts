import * as v from "valibot";

export const exportThreadSchema = v.object({
	messages: v.optional(
		v.array(
			v.object({
				content: v.optional(v.string()),
				photos: v.optional(v.array(v.object({}))),
				sender_name: v.optional(v.string()),
			}),
		),
	),
});

export type ExportMessage = {
	hasPhoto: boolean;
	text: string;
};

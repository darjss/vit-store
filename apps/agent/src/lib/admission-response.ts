import * as v from "valibot";

export const admissionResponseSchema = v.object({
	admitted: v.optional(v.boolean()),
});

export type AdmissionResponse = v.InferOutput<typeof admissionResponseSchema>;

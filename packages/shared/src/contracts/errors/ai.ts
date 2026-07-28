import * as v from "valibot";
import { publicErrorSchema } from "../errors";

export const aiOperationErrorSchema = v.variant("_tag", [
	publicErrorSchema("InvalidSource", {
		message: v.string(),
	}),
	publicErrorSchema("ExtractionFailed", {
		retryable: v.boolean(),
		message: v.string(),
	}),
	publicErrorSchema("InvalidModelOutput", {
		message: v.string(),
	}),
	publicErrorSchema("ProductResolutionRequired", {
		lines: v.array(v.pipe(v.number(), v.integer(), v.minValue(1))),
		message: v.string(),
	}),
	publicErrorSchema("NoUsableImages", {
		message: v.string(),
	}),
	publicErrorSchema("ProviderUnavailable", {
		retryable: v.boolean(),
		message: v.string(),
	}),
]);

export type AiOperationError = v.InferOutput<typeof aiOperationErrorSchema>;

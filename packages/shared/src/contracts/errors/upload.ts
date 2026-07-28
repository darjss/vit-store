import * as v from "valibot";
import { publicErrorSchema } from "../errors";

export const uploadErrorSchema = v.variant("_tag", [
	publicErrorSchema("ImageRequired", { message: v.string() }),
	publicErrorSchema("UnsupportedImageType", {
		received: v.string(),
		allowed: v.array(v.string()),
		message: v.string(),
	}),
	publicErrorSchema("ImageTooLarge", {
		maximumBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
		message: v.string(),
	}),
	publicErrorSchema("TooManyImages", {
		maximum: v.pipe(v.number(), v.integer(), v.minValue(1)),
		message: v.string(),
	}),
	publicErrorSchema("ImageFetchFailed", {
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
		retryable: v.boolean(),
		message: v.string(),
	}),
	publicErrorSchema("ImageTransformFailed", {
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
		message: v.string(),
	}),
	publicErrorSchema("StorageUnavailable", {
		retryable: v.boolean(),
		message: v.string(),
	}),
]);

export type UploadError = v.InferOutput<typeof uploadErrorSchema>;

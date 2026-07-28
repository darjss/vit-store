import * as v from "valibot";
import { publicErrorSchema } from "./errors";

const allowedImageTypesSchema = v.array(v.string());

export const uploadErrorSchema = v.variant("_tag", [
	publicErrorSchema("ImageRequired", {}),
	publicErrorSchema("UnsupportedImageType", {
		received: v.string(),
		allowed: allowedImageTypesSchema,
	}),
	publicErrorSchema("ImageTooLarge", {
		maximumBytes: v.pipe(v.number(), v.integer(), v.minValue(1)),
	}),
	publicErrorSchema("TooManyImages", {
		maximum: v.pipe(v.number(), v.integer(), v.minValue(1)),
	}),
	publicErrorSchema("InvalidUploadName", {}),
	publicErrorSchema("InvalidImageUrl", {
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
	}),
	publicErrorSchema("ImageFetchFailed", {
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
		retryable: v.boolean(),
	}),
	publicErrorSchema("ImageTransformFailed", {
		index: v.pipe(v.number(), v.integer(), v.minValue(0)),
	}),
	publicErrorSchema("StorageUnavailable", {
		retryable: v.boolean(),
	}),
]);

export type UploadError = v.InferOutput<typeof uploadErrorSchema>;

export const uploadedImageSchema = v.strictObject({
	index: v.pipe(v.number(), v.integer(), v.minValue(0)),
	url: v.pipe(v.string(), v.url()),
});

export type UploadedImage = v.InferOutput<typeof uploadedImageSchema>;

export const uploadItemFailureSchema = v.strictObject({
	index: v.pipe(v.number(), v.integer(), v.minValue(0)),
	error: uploadErrorSchema,
});

export type UploadItemFailure = v.InferOutput<typeof uploadItemFailureSchema>;

const batchFields = {
	images: v.array(uploadedImageSchema),
	failures: v.array(uploadItemFailureSchema),
	time: v.pipe(v.number(), v.integer(), v.minValue(0)),
} as const;

/** Additive REST response. `images` contains only committed R2 objects. */
export const multiImageUploadResponseSchema = v.variant("status", [
	v.strictObject({
		status: v.literal("complete"),
		...batchFields,
	}),
	v.strictObject({
		status: v.literal("partial"),
		...batchFields,
	}),
	v.strictObject({
		status: v.literal("error"),
		...batchFields,
	}),
]);

export type MultiImageUploadResponse = v.InferOutput<
	typeof multiImageUploadResponseSchema
>;

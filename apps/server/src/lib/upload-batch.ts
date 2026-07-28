import {
	type MultiImageUploadResponse,
	multiImageUploadResponseSchema,
	type UploadedImage,
	type UploadItemFailure,
} from "@vit/shared";
import { match } from "dismatch";
import * as v from "valibot";

type BatchState =
	| { _tag: "Complete" }
	| { _tag: "Partial" }
	| { _tag: "Error" };

export const buildMultiImageUploadResponse = (
	images: UploadedImage[],
	failures: UploadItemFailure[],
	time: number,
): MultiImageUploadResponse => {
	const state: BatchState =
		failures.length === 0
			? { _tag: "Complete" }
			: images.length === 0
				? { _tag: "Error" }
				: { _tag: "Partial" };
	return v.parse(
		multiImageUploadResponseSchema,
		match(
			state,
			"_tag",
		)<MultiImageUploadResponse>({
			Complete: () => ({ status: "complete", images, failures, time }),
			Partial: () => ({ status: "partial", images, failures, time }),
			Error: () => ({ status: "error", images, failures, time }),
		}),
	);
};

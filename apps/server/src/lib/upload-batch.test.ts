import { describe, expect, test } from "bun:test";
import { buildMultiImageUploadResponse } from "./upload-batch";

const image = { index: 0, url: "https://cdn.example.com/image.webp" };
const failure = {
	index: 1,
	error: { _tag: "ImageFetchFailed" as const, index: 1, retryable: true },
};

describe("multi-image upload aggregate", () => {
	test("returns complete when every committed image succeeds", () => {
		expect(buildMultiImageUploadResponse([image], [], 10)).toEqual({
			status: "complete",
			images: [image],
			failures: [],
			time: 10,
		});
	});

	test("returns typed partial success", () => {
		expect(buildMultiImageUploadResponse([image], [failure], 12)).toEqual({
			status: "partial",
			images: [image],
			failures: [failure],
			time: 12,
		});
	});

	test("returns error when no object was committed", () => {
		expect(buildMultiImageUploadResponse([], [failure], 8)).toEqual({
			status: "error",
			images: [],
			failures: [failure],
			time: 8,
		});
	});
});

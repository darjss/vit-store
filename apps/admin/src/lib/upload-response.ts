import * as v from "valibot";

const uploadResponseSchema = v.object({
	message: v.string(),
	url: v.optional(v.string()),
});

export async function parseUploadResponse(response: Response): Promise<string> {
	const data = v.parse(uploadResponseSchema, await response.json());
	if (response.ok && data.url) {
		return data.url;
	}
	throw new Error(data.message || `Upload failed (${response.status})`);
}

import { object, optional, parse, string } from "valibot";

const uploadResponseSchema = object({
	message: string(),
	url: optional(string()),
});

export async function parseUploadResponse(response: Response): Promise<string> {
	const data = parse(uploadResponseSchema, await response.json());
	if (response.ok && data.url) {
		return data.url;
	}
	throw new Error(data.message || `Upload failed (${response.status})`);
}

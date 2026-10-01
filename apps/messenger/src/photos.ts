import type { ImagePart } from "ai";

// Only Meta CDN hosts are fetched: Zernio forwards Meta attachment urls, and
// fetching arbitrary inbound urls would make the worker an open fetch proxy.
const isAllowedHost = (url: string): boolean => {
	try {
		const host = new URL(url).hostname;
		return host.endsWith(".fbcdn.net") || host.endsWith(".fbsbx.com");
	} catch {
		return false;
	}
};

const PHOTO_TIMEOUT_MS = 8000;
const PHOTO_MAX_BYTES = 5_000_000;

export type InboundAttachment = { type: string; url?: string | null };

// Fetches image attachments into AI SDK image parts. Expired or oversized urls
// are skipped — the text turn still runs.
export const fetchImageParts = async (
	attachments: Array<InboundAttachment>,
): Promise<Array<ImagePart>> => {
	const urls = attachments.flatMap((a) =>
		a.type === "image" && a.url !== undefined && a.url !== null && isAllowedHost(a.url)
			? [a.url]
			: [],
	);
	const parts: Array<ImagePart> = [];
	for (const url of urls) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
			if (!response.ok) {
				continue;
			}
			const bytes = new Uint8Array(await response.arrayBuffer());
			if (bytes.byteLength > PHOTO_MAX_BYTES) {
				continue;
			}
			parts.push({
				image: bytes,
				mediaType: response.headers.get("content-type") ?? "image/jpeg",
				type: "image",
			});
		} catch {
			// skip
		}
	}
	return parts;
};

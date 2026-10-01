import type { ImagePart } from "ai";
import type { Env } from "./env";

// Only Meta CDN hosts are fetched by default: Zernio forwards Meta attachment
// urls, and fetching arbitrary inbound urls would make the worker an open
// fetch proxy. PHOTO_HOSTS overrides the list (".suffix" or exact host), which
// the local eval uses to serve export photos from 127.0.0.1.
const DEFAULT_PHOTO_HOSTS = ".fbcdn.net,.fbsbx.com";

const allowedHosts = (env: Env): Array<string> => {
	// An empty PHOTO_HOSTS means "use the defaults", not "allow nothing".
	const raw = env.PHOTO_HOSTS?.trim();
	return (raw === undefined || raw === "" ? DEFAULT_PHOTO_HOSTS : raw)
		.split(",")
		.map((h) => h.trim())
		.filter((h) => h.length > 0);
};

const isAllowedHost = (url: string, hosts: Array<string>): boolean => {
	try {
		const host = new URL(url).hostname;
		return hosts.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
	} catch {
		return false;
	}
};

const PHOTO_TIMEOUT_MS = 8000;
const PHOTO_MAX_BYTES = 5_000_000;

export type InboundAttachment = { type: string; url?: string | null };

// Reads a response body while counting bytes; aborts and returns undefined
// past the cap.
const readCapped = async (body: ReadableStream<Uint8Array>): Promise<Uint8Array | undefined> => {
	const reader = body.getReader();
	const chunks: Array<Uint8Array> = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			total += value.byteLength;
			if (total > PHOTO_MAX_BYTES) {
				await reader.cancel();
				return undefined;
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

// Fetches image attachments into AI SDK image parts. Expired or oversized urls
// are skipped — the text turn still runs.
export const fetchImageParts = async (
	env: Env,
	attachments: Array<InboundAttachment>,
): Promise<Array<ImagePart>> => {
	const hosts = allowedHosts(env);
	const urls = attachments.flatMap((a) =>
		a.type === "image" && a.url !== undefined && a.url !== null && isAllowedHost(a.url, hosts)
			? [a.url]
			: [],
	);
	const parts: Array<ImagePart> = [];
	for (const url of urls) {
		try {
			const response = await fetch(url, { signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS) });
			if (!response.ok || response.body === null) {
				continue;
			}
			// Enforce the size cap before and while reading: a declared
			// content-length over the cap or a body that grows past it aborts.
			const declared = Number(response.headers.get("content-length") ?? "0");
			if (declared > PHOTO_MAX_BYTES) {
				await response.body.cancel();
				continue;
			}
			const bytes = await readCapped(response.body);
			if (bytes === undefined) {
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

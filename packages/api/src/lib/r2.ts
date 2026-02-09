import { env } from "cloudflare:workers";

export function r2(): R2Bucket {
	return env.r2Bucket;
}

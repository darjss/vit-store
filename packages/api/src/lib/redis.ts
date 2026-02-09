import { env } from "cloudflare:workers";
import { Redis } from "@upstash/redis";

let redisClient: Redis | null = null;

export function redis(): Redis {
	if (!redisClient) {
		redisClient = new Redis({
			url: env.UPSTASH_REDIS_REST_URL,
			token: env.UPSTASH_REDIS_REST_TOKEN,
		});
	}
	return redisClient;
}

/// <reference types="astro/client" />

import type { storev2 } from "./alchemy.run.ts";
import type { Bound, WorkerRef } from "alchemy/cloudflare";

type Storev2Env = typeof storev2.Env;
type StoreServerBinding = Bound<ReturnType<typeof WorkerRef>>;
export type CloudflareEnv = Storev2Env & {
	server: StoreServerBinding;
};
type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

interface PostHog {
	init: (apiKey: string, options?: Record<string, unknown>) => void;
	capture: (event: string, properties?: Record<string, unknown>) => void;
	identify: (distinctId: string, properties?: Record<string, unknown>) => void;
	captureException: (error: unknown, properties?: Record<string, unknown>) => void;
	get_distinct_id: () => string;
}

declare global {
	type Env = CloudflareEnv;
	namespace App {
		interface Locals extends Runtime {}
	}
	interface Window {
		posthog?: PostHog;
	}
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		export interface Env extends CloudflareEnv {}
	}
}

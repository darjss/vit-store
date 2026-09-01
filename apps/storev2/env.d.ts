/// <reference types="astro/client" />

import type { storev2 } from "./alchemy.run.ts";
import type { Bound, WorkerRef } from "alchemy/cloudflare";

type Storev2Env = Awaited<typeof storev2>["Env"];
type StoreServerBinding = Bound<ReturnType<typeof WorkerRef>>;
export type CloudflareEnv = Storev2Env & {
	server: StoreServerBinding;
};
type Runtime = import("@astrojs/cloudflare").Runtime<CloudflareEnv>;

import type { AnalyticsProperties } from "@/lib/analytics-props";
import type { ThrownErrorWire } from "@/lib/error-wire";

interface PostHog {
	capture: (event: string, properties?: AnalyticsProperties) => void;
	captureException: (error: ThrownErrorWire, properties?: AnalyticsProperties) => void;
	get_distinct_id: () => string;
	identify: (distinctId: string, properties?: AnalyticsProperties) => void;
	init: (apiKey: string, options?: AnalyticsProperties) => void;
}

declare global {
	type Env = CloudflareEnv;
	namespace App {
		type Locals = Runtime;
	}
	interface Window {
		posthog?: PostHog;
	}
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		export type Env = CloudflareEnv;
	}
}

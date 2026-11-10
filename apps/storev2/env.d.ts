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
import type { MetaPixelOptions, MetaPixelParams } from "@/lib/meta-pixel";

interface PostHog {
	capture: (event: string, properties?: AnalyticsProperties) => void;
	captureException: (error: ThrownErrorWire, properties?: AnalyticsProperties) => void;
	get_distinct_id: () => string;
	identify: (distinctId: string, properties?: AnalyticsProperties) => void;
	init: (apiKey: string, options?: AnalyticsProperties) => void;
}

declare global {
	type Env = CloudflareEnv;
	interface ImportMetaEnv {
		readonly PUBLIC_META_PIXEL_DEV?: string;
	}
	namespace App {
		type Locals = Runtime;
	}
	interface Window {
		fbq?: (
			command: "track",
			event: string,
			params: MetaPixelParams,
			options?: MetaPixelOptions,
		) => void;
		posthog?: PostHog;
	}
}

declare module "cloudflare:workers" {
	namespace Cloudflare {
		export type Env = CloudflareEnv;
	}
}

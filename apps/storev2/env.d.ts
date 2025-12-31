/// <reference types="astro/client" />
/// <reference types="unplugin-icons/types/solid" />

import type { storev2 } from "./alchemy.run.ts";

type Runtime = import("@astrojs/cloudflare").Runtime<typeof storev2.Env>;

interface PostHog {
	capture: (event: string, properties?: Record<string, unknown>) => void;
	identify: (distinctId: string, properties?: Record<string, unknown>) => void;
}

declare global {
	namespace App {
		interface Locals extends Runtime {}
	}
	interface Window {
		posthog?: PostHog;
	}
}

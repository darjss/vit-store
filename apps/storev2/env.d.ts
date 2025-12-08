/// <reference types="astro/client" />
/// <reference types="unplugin-icons/types/solid" />

import type { storev2 } from "./alchemy.run.ts";

type Runtime = import("@astrojs/cloudflare").Runtime<typeof storev2.Env>;

declare global {
	namespace App {
		interface Locals extends Runtime {}
	}
}

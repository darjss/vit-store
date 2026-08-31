/** Default Workers AI model for Flue agent chat turns (tools + replies). */
export const FLUE_ASSISTANT_MODEL =
	"cloudflare/@cf/zai-org/glm-5.3-flash" as const;

/** Unprefixed Workers AI slug for `env.AI.run()` (e.g. photo vision). */
export const ASSISTANT_VISION_MODEL = "@cf/zai-org/glm-5.3-flash" as const;

export const CUSTOMER_ASSISTANT_MODEL = FLUE_ASSISTANT_MODEL;
export const ADMIN_ASSISTANT_MODEL = FLUE_ASSISTANT_MODEL;

import { createLogger, createMinimalLogger } from "@vit/logger";

export const logger = createLogger({
	requestId: "api",
	userType: "system",
});

export const minimalLogger = createMinimalLogger();

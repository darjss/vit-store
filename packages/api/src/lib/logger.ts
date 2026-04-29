import { createLogger, createMinimalLogger } from "@vit/logger";

export const logger = createLogger({
	requestId: "api",
	userType: "system",
});

const minimalLogger = createMinimalLogger();

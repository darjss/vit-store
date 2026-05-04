import { createLogger, createMinimalLogger, generateRequestId } from "@vit/logger";

export const logger = createLogger(() => ({
	requestId: generateRequestId(),
	userType: "system" as const,
}));

const minimalLogger = createMinimalLogger();

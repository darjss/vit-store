import type { Context, MiddlewareHandler } from "hono";
import { createRequestContext } from "./context";
import { createLogger, generateRequestId } from "./logger";
import type { LogContext, Logger, UserType } from "./types";

const LOGGER_KEY = "logger";
const LOG_CONTEXT_KEY = "logContext";

export function getLogger(c: Context): Logger {
	const logger = c.get(LOGGER_KEY) as Logger | undefined;
	if (!logger) {
		return createLogger({
			requestId: generateRequestId(),
			userType: "anonymous",
		});
	}
	return logger;
}

export function getLogContext(c: Context): LogContext | undefined {
	return c.get(LOG_CONTEXT_KEY) as LogContext | undefined;
}

export function setLogger(c: Context, logger: Logger): void {
	c.set(LOGGER_KEY, logger);
	c.set(LOG_CONTEXT_KEY, logger.getContext());
}

export function updateLoggerContext(
	c: Context,
	updates: Partial<LogContext>,
): Logger {
	const currentLogger = getLogger(c);
	const newLogger = currentLogger.child(updates);
	setLogger(c, newLogger);
	return newLogger;
}

export interface LoggerMiddlewareOptions {
	getUserInfo?: (c: Context) => {
		userId?: number | string;
		userPhone?: number;
		userEmail?: string;
		userType?: UserType;
	} | null;

	logRequestStart?: boolean;
	logRequestEnd?: boolean;
	excludePaths?: string[];
}

export function loggerMiddleware(
	options: LoggerMiddlewareOptions = {},
): MiddlewareHandler {
	const {
		logRequestStart = true,
		logRequestEnd = true,
		excludePaths = ["/health-check", "/favicon.ico"],
	} = options;

	return async (c, next) => {
		const startTime = Date.now();
		const url = new URL(c.req.url);

		if (excludePaths.includes(url.pathname)) {
			return next();
		}

		const requestId = generateRequestId();
		const logContext = createRequestContext(c.req.raw, {
			requestId,
			userType: "anonymous",
		});

		const logger = createLogger(logContext);
		setLogger(c, logger);

		if (logRequestStart) {
			logger.system.requestStart({
				path: url.pathname,
				method: c.req.method,
			});
		}

		try {
			await next();

			const durationMs = Date.now() - startTime;

			if (options.getUserInfo) {
				const userInfo = options.getUserInfo(c);
				if (userInfo) {
					updateLoggerContext(c, {
						userId: userInfo.userId,
						userPhone: userInfo.userPhone,
						userEmail: userInfo.userEmail,
						userType: userInfo.userType ?? "anonymous",
					});
				}
			}

			if (logRequestEnd) {
				const finalLogger = getLogger(c);
				finalLogger.system.requestEnd({
					path: url.pathname,
					method: c.req.method,
					status: c.res.status,
					durationMs,
				});
			}
		} catch (error) {
			const durationMs = Date.now() - startTime;

			logger.error("system.request_error", error, {
				path: url.pathname,
				method: c.req.method,
				durationMs,
			});

			throw error;
		}
	};
}

export function createTrpcLoggingMiddleware(
	getLoggerFromCtx: (ctx: unknown) => Logger | null,
) {
	return async <
		T extends {
			ctx: unknown;
			next: () => Promise<unknown>;
			path: string;
			type: string;
			input: unknown;
		},
	>(
		opts: T,
	) => {
		const { ctx, next, path, type, input } = opts;
		const startTime = Date.now();

		const logger = getLoggerFromCtx(ctx);
		const procedureType = type?.toUpperCase() || "PROCEDURE";

		logger?.info("trpc.procedure_start", {
			procedure: path,
			type: procedureType,
			hasInput: input !== undefined,
		});

		try {
			const result = await next();
			const durationMs = Date.now() - startTime;

			logger?.info("trpc.procedure_success", {
				procedure: path,
				type: procedureType,
				durationMs,
			});

			return result;
		} catch (error) {
			const durationMs = Date.now() - startTime;

			logger?.error("trpc.procedure_error", error, {
				procedure: path,
				type: procedureType,
				durationMs,
			});

			throw error;
		}
	};
}

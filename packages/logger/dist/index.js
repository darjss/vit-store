//#region src/context.ts
function extractClientIp(request) {
	const ip = request.headers.get("cf-connecting-ip");
	if (!ip) return void 0;
	const parts = ip.split(".");
	if (parts.length === 4) return `${parts[0]}.${parts[1]}.x.x`;
	const ipv6Parts = ip.split(":");
	if (ipv6Parts.length > 1) return `${ipv6Parts[0]}:${ipv6Parts[1]}:***`;
	return ip;
}
function extractCfContext(request) {
	const cf = request.cf;
	return {
		rayId: request.headers.get("cf-ray") ?? void 0,
		colo: cf?.colo,
		clientIp: extractClientIp(request)
	};
}
function createRequestContext(request, options) {
	const url = new URL(request.url);
	const cfContext = extractCfContext(request);
	return {
		requestId: options?.requestId ?? crypto.randomUUID(),
		rayId: cfContext.rayId,
		colo: cfContext.colo,
		clientIp: cfContext.clientIp,
		path: url.pathname,
		method: request.method,
		userId: options?.userId,
		userPhone: options?.userPhone,
		userEmail: options?.userEmail,
		userType: options?.userType ?? "anonymous"
	};
}
function enrichWithCustomerSession(context, session) {
	if (!session) return context;
	return {
		...context,
		userId: session.user.id,
		userPhone: session.user.phone,
		userType: "customer"
	};
}
function enrichWithAdminSession(context, session) {
	if (!session) return context;
	return {
		...context,
		userId: session.user.id,
		userEmail: session.user.name,
		userType: "admin"
	};
}

//#endregion
//#region src/logger.ts
function formatError(error) {
	if (!error) return void 0;
	if (error instanceof Error) return {
		name: error.name,
		message: error.message,
		stack: error.stack
	};
	if (typeof error === "string") return {
		name: "Error",
		message: error
	};
	return {
		name: "UnknownError",
		message: String(error)
	};
}
function toSnakeCase(obj) {
	const result = {};
	for (const [key, value] of Object.entries(obj)) {
		const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
		result[snakeKey] = value;
	}
	return result;
}
function createLogEntry(level, event, context, data, error, durationMs) {
	const entry = {
		level,
		event,
		timestamp: (/* @__PURE__ */ new Date()).toISOString(),
		request_id: context.requestId,
		user_type: context.userType
	};
	if (context.rayId) entry.ray_id = context.rayId;
	if (context.userId) entry.user_id = context.userId;
	if (context.userPhone) entry.user_phone = context.userPhone;
	if (context.userEmail) entry.user_email = context.userEmail;
	if (data && Object.keys(data).length > 0) entry.data = toSnakeCase(data);
	if (durationMs !== void 0) entry.duration_ms = durationMs;
	const formattedError = formatError(error);
	if (formattedError) entry.error = formattedError;
	return entry;
}
function output(entry) {
	switch (entry.level) {
		case "debug":
			console.debug(entry);
			break;
		case "info":
			console.log(entry);
			break;
		case "warn":
			console.warn(entry);
			break;
		case "error":
			console.error(entry);
			break;
	}
}
function createAuthLogger(context, log) {
	return {
		otpSent: (data) => log("info", "auth.otp_sent", data),
		otpVerified: (data) => log("info", "auth.otp_verified", data),
		otpFailed: (data) => log("warn", "auth.otp_failed", data),
		loginSuccess: (data) => log("info", "auth.login_success", data),
		loginFailed: (data) => log("warn", "auth.login_failed", data),
		sessionCreated: (data) => log("info", "auth.session_created", data),
		sessionExpired: (data) => log("info", "auth.session_expired", data),
		sessionRenewed: (data) => log("debug", "auth.session_renewed", data),
		logout: (data) => log("info", "auth.logout", data)
	};
}
function createOrderLogger(context, log) {
	return {
		created: (data) => log("info", "order.created", data),
		updated: (data) => log("info", "order.updated", data),
		statusChanged: (data) => log("info", "order.status_changed", data),
		cancelled: (data) => log("warn", "order.cancelled", data),
		completed: (data) => log("info", "order.completed", data),
		viewed: (data) => log("debug", "order.viewed", data)
	};
}
function createPaymentLogger(context, log) {
	return {
		created: (data) => log("info", "payment.created", data),
		confirmed: (data) => log("info", "payment.confirmed", data),
		failed: (data) => log("error", "payment.failed", data),
		statusChanged: (data) => log("info", "payment.status_changed", data),
		notificationSent: (data) => log("info", "payment.notification_sent", data)
	};
}
function createProductLogger(context, log) {
	return {
		created: (data) => log("info", "product.created", data),
		updated: (data) => log("info", "product.updated", data),
		deleted: (data) => log("warn", "product.deleted", data),
		viewed: (data) => log("debug", "product.viewed", data),
		searched: (data) => log("debug", "product.searched", data)
	};
}
function createAdminLogger(context, log) {
	return {
		login: (data) => log("info", "admin.login", data),
		action: (data) => log("info", "admin.action", data),
		bulkAction: (data) => log("info", "admin.bulk_action", data),
		syncTriggered: (data) => log("info", "admin.sync_triggered", data)
	};
}
function createSystemLogger(context, log) {
	return {
		requestStart: (data) => log("debug", "system.request_start", data),
		requestEnd: (data) => log("info", "system.request_end", data),
		requestError: (data) => log("error", "system.request_error", data),
		cacheHit: (data) => log("debug", "cache.hit", data),
		cacheMiss: (data) => log("debug", "cache.miss", data),
		cacheSet: (data) => log("debug", "cache.set", data),
		rateLimited: (data) => log("warn", "system.rate_limited", data)
	};
}
function createWebhookLogger(context, log) {
	return {
		received: (data) => log("info", "webhook.received", data),
		processed: (data) => log("info", "webhook.processed", data),
		failed: (data) => log("error", "webhook.failed", data)
	};
}
function createLogger(context) {
	const log = (level, event, data, error, durationMs) => {
		output(createLogEntry(level, event, context, data, error, durationMs));
	};
	const logWithLevel = (level, event, data) => {
		log(level, event, data);
	};
	return {
		debug: (event, data) => log("debug", event, data),
		info: (event, data) => log("info", event, data),
		warn: (event, data) => log("warn", event, data),
		error: (event, error, data) => log("error", event, data, error),
		auth: createAuthLogger(context, logWithLevel),
		order: createOrderLogger(context, logWithLevel),
		payment: createPaymentLogger(context, logWithLevel),
		product: createProductLogger(context, logWithLevel),
		admin: createAdminLogger(context, logWithLevel),
		system: createSystemLogger(context, logWithLevel),
		webhook: createWebhookLogger(context, logWithLevel),
		child: (additionalContext) => {
			return createLogger({
				...context,
				...additionalContext
			});
		},
		getContext: () => context
	};
}
function createMinimalLogger() {
	return createLogger({
		requestId: "system",
		userType: "system"
	});
}
function generateRequestId() {
	return crypto.randomUUID();
}

//#endregion
//#region src/middleware.ts
const LOGGER_KEY = "logger";
const LOG_CONTEXT_KEY = "logContext";
function getLogger(c) {
	const logger = c.get(LOGGER_KEY);
	if (!logger) return createLogger({
		requestId: generateRequestId(),
		userType: "anonymous"
	});
	return logger;
}
function getLogContext(c) {
	return c.get(LOG_CONTEXT_KEY);
}
function setLogger(c, logger) {
	c.set(LOGGER_KEY, logger);
	c.set(LOG_CONTEXT_KEY, logger.getContext());
}
function updateLoggerContext(c, updates) {
	const newLogger = getLogger(c).child(updates);
	setLogger(c, newLogger);
	return newLogger;
}
function loggerMiddleware(options = {}) {
	const { logRequestStart = true, logRequestEnd = true, excludePaths = ["/health-check", "/favicon.ico"] } = options;
	return async (c, next) => {
		const startTime = Date.now();
		const url = new URL(c.req.url);
		if (excludePaths.includes(url.pathname)) return next();
		const requestId = generateRequestId();
		const logger = createLogger(createRequestContext(c.req.raw, {
			requestId,
			userType: "anonymous"
		}));
		setLogger(c, logger);
		if (logRequestStart) logger.system.requestStart({
			path: url.pathname,
			method: c.req.method
		});
		try {
			await next();
			const durationMs = Date.now() - startTime;
			if (options.getUserInfo) {
				const userInfo = options.getUserInfo(c);
				if (userInfo) updateLoggerContext(c, {
					userId: userInfo.userId,
					userPhone: userInfo.userPhone,
					userEmail: userInfo.userEmail,
					userType: userInfo.userType ?? "anonymous"
				});
			}
			if (logRequestEnd) getLogger(c).system.requestEnd({
				path: url.pathname,
				method: c.req.method,
				status: c.res.status,
				durationMs
			});
		} catch (error) {
			const durationMs = Date.now() - startTime;
			logger.error("system.request_error", error, {
				path: url.pathname,
				method: c.req.method,
				durationMs
			});
			throw error;
		}
	};
}
function createTrpcLoggingMiddleware(getLoggerFromCtx) {
	return async (opts) => {
		const { ctx, next, path, type, input } = opts;
		const startTime = Date.now();
		const logger = getLoggerFromCtx(ctx);
		const procedureType = type?.toUpperCase() || "PROCEDURE";
		logger?.info("trpc.procedure_start", {
			procedure: path,
			type: procedureType,
			hasInput: input !== void 0
		});
		try {
			const result = await next();
			const durationMs = Date.now() - startTime;
			logger?.info("trpc.procedure_success", {
				procedure: path,
				type: procedureType,
				durationMs
			});
			return result;
		} catch (error) {
			const durationMs = Date.now() - startTime;
			logger?.error("trpc.procedure_error", error, {
				procedure: path,
				type: procedureType,
				durationMs
			});
			throw error;
		}
	};
}

//#endregion
export { createLogger, createMinimalLogger, createRequestContext, createTrpcLoggingMiddleware, enrichWithAdminSession, enrichWithCustomerSession, extractCfContext, extractClientIp, generateRequestId, getLogContext, getLogger, loggerMiddleware, setLogger, updateLoggerContext };
//# sourceMappingURL=index.js.map
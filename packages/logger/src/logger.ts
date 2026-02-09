import type {
	AdminEventData,
	AdminLogger,
	AuthEventData,
	AuthLogger,
	LogContext,
	LogEntry,
	Logger,
	LogLevel,
	OrderEventData,
	OrderLogger,
	PaymentEventData,
	PaymentLogger,
	ProductEventData,
	ProductLogger,
	SystemEventData,
	SystemLogger,
	WebhookEventData,
	WebhookLogger,
} from "./types";

function formatError(error: Error | unknown): LogEntry["error"] | undefined {
	if (!error) return undefined;

	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	if (typeof error === "string") {
		return {
			name: "Error",
			message: error,
		};
	}

	return {
		name: "UnknownError",
		message: String(error),
	};
}

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
		result[snakeKey] = value;
	}
	return result;
}

function createLogEntry(
	level: LogLevel,
	event: string,
	context: LogContext,
	data?: Record<string, unknown>,
	error?: Error | unknown,
	durationMs?: number,
): LogEntry {
	const entry: LogEntry = {
		level,
		event,
		timestamp: new Date().toISOString(),
		request_id: context.requestId,
		user_type: context.userType,
	};

	if (context.rayId) entry.ray_id = context.rayId;
	if (context.userId) entry.user_id = context.userId;
	if (context.userPhone) entry.user_phone = context.userPhone;
	if (context.userEmail) entry.user_email = context.userEmail;

	if (data && Object.keys(data).length > 0) {
		entry.data = toSnakeCase(data);
	}

	if (durationMs !== undefined) {
		entry.duration_ms = durationMs;
	}

	const formattedError = formatError(error);
	if (formattedError) {
		entry.error = formattedError;
	}

	return entry;
}

function output(entry: LogEntry): void {
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

function createAuthLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): AuthLogger {
	return {
		otpSent: (data) => log("info", "auth.otp_sent", data),
		otpVerified: (data) => log("info", "auth.otp_verified", data),
		otpFailed: (data) => log("warn", "auth.otp_failed", data),
		loginSuccess: (data) => log("info", "auth.login_success", data),
		loginFailed: (data) => log("warn", "auth.login_failed", data),
		sessionCreated: (data) => log("info", "auth.session_created", data),
		sessionExpired: (data) => log("info", "auth.session_expired", data),
		sessionRenewed: (data) => log("debug", "auth.session_renewed", data),
		logout: (data) => log("info", "auth.logout", data),
	};
}

function createOrderLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): OrderLogger {
	return {
		created: (data) => log("info", "order.created", data),
		updated: (data) => log("info", "order.updated", data),
		statusChanged: (data) => log("info", "order.status_changed", data),
		cancelled: (data) => log("warn", "order.cancelled", data),
		completed: (data) => log("info", "order.completed", data),
		viewed: (data) => log("debug", "order.viewed", data),
	};
}

function createPaymentLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): PaymentLogger {
	return {
		created: (data) => log("info", "payment.created", data),
		confirmed: (data) => log("info", "payment.confirmed", data),
		failed: (data) => log("error", "payment.failed", data),
		statusChanged: (data) => log("info", "payment.status_changed", data),
		notificationSent: (data) => log("info", "payment.notification_sent", data),
	};
}

function createProductLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): ProductLogger {
	return {
		created: (data) => log("info", "product.created", data),
		updated: (data) => log("info", "product.updated", data),
		deleted: (data) => log("warn", "product.deleted", data),
		viewed: (data) => log("debug", "product.viewed", data),
		searched: (data) => log("debug", "product.searched", data),
	};
}

function createAdminLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): AdminLogger {
	return {
		login: (data) => log("info", "admin.login", data),
		action: (data) => log("info", "admin.action", data),
		bulkAction: (data) => log("info", "admin.bulk_action", data),
		syncTriggered: (data) => log("info", "admin.sync_triggered", data),
	};
}

function createSystemLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): SystemLogger {
	return {
		requestStart: (data) => log("debug", "system.request_start", data),
		requestEnd: (data) => log("info", "system.request_end", data),
		requestError: (data) => log("error", "system.request_error", data),
		cacheHit: (data) => log("debug", "cache.hit", data),
		cacheMiss: (data) => log("debug", "cache.miss", data),
		cacheSet: (data) => log("debug", "cache.set", data),
		rateLimited: (data) => log("warn", "system.rate_limited", data),
	};
}

function createWebhookLogger(
	context: LogContext,
	log: (level: LogLevel, event: string, data?: Record<string, unknown>) => void,
): WebhookLogger {
	return {
		received: (data) => log("info", "webhook.received", data),
		processed: (data) => log("info", "webhook.processed", data),
		failed: (data) => log("error", "webhook.failed", data),
	};
}

export function createLogger(context: LogContext): Logger {
	const log = (
		level: LogLevel,
		event: string,
		data?: Record<string, unknown>,
		error?: Error | unknown,
		durationMs?: number,
	) => {
		const entry = createLogEntry(
			level,
			event,
			context,
			data,
			error,
			durationMs,
		);
		output(entry);
	};

	const logWithLevel = (
		level: LogLevel,
		event: string,
		data?: Record<string, unknown>,
	) => {
		log(level, event, data);
	};

	const logger: Logger = {
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
			return createLogger({ ...context, ...additionalContext });
		},

		getContext: () => context,
	};

	return logger;
}

export function createMinimalLogger(): Logger {
	return createLogger({
		requestId: "system",
		userType: "system",
	});
}

export function generateRequestId(): string {
	return crypto.randomUUID();
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export type UserType = "customer" | "admin" | "anonymous" | "system";

export interface LogContext {
	requestId: string;
	rayId?: string;
	userId?: number | string;
	userPhone?: number;
	userEmail?: string;
	userType: UserType;
	path?: string;
	method?: string;
	colo?: string;
	clientIp?: string;
}

export interface LogEntry {
	level: LogLevel;
	event: string;
	timestamp: string;
	request_id: string;
	ray_id?: string;
	user_id?: number | string;
	user_phone?: number;
	user_email?: string;
	user_type: UserType;
	data?: Record<string, unknown>;
	duration_ms?: number;
	error?: {
		name: string;
		message: string;
		code?: string;
		stack?: string;
	};
}

export type EventCategory =
	| "auth"
	| "order"
	| "payment"
	| "product"
	| "admin"
	| "system"
	| "cache"
	| "webhook";

export type EventData = Record<string, unknown>;

export interface AuthEventData extends EventData {
	phone?: number;
	adminId?: string;
	adminEmail?: string;
	attemptCount?: number;
	failureReason?: string;
	sessionId?: string;
}

export interface OrderEventData extends EventData {
	orderId?: number;
	orderNumber?: string;
	customerId?: number;
	customerPhone?: number;
	total?: number;
	itemCount?: number;
	status?: string;
	previousStatus?: string;
	deliveryProvider?: string;
}

export interface PaymentEventData extends EventData {
	paymentId?: number;
	paymentNumber?: string;
	orderId?: number;
	orderNumber?: string;
	amount?: number;
	provider?: string;
	status?: string;
	previousStatus?: string;
	failureReason?: string;
}

export interface ProductEventData extends EventData {
	productId?: number;
	productSlug?: string;
	productName?: string;
	brandId?: number;
	categoryId?: number;
	price?: number;
	action?: string;
}

export interface AdminEventData extends EventData {
	adminId?: string;
	action?: string;
	targetType?: string;
	targetId?: number | string;
	changes?: Record<string, unknown>;
}

export interface SystemEventData extends EventData {
	path?: string;
	method?: string;
	status?: number;
	durationMs?: number;
	error?: string;
	cacheKey?: string;
	cacheHit?: boolean;
	cacheTtl?: number;
}

export interface WebhookEventData extends EventData {
	provider?: string;
	eventType?: string;
	payloadSize?: number;
	success?: boolean;
	error?: string;
}

export interface Logger {
	debug(event: string, data?: Record<string, unknown>): void;
	info(event: string, data?: Record<string, unknown>): void;
	warn(event: string, data?: Record<string, unknown>): void;
	error(
		event: string,
		error?: Error | unknown,
		data?: Record<string, unknown>,
	): void;

	auth: AuthLogger;
	order: OrderLogger;
	payment: PaymentLogger;
	product: ProductLogger;
	admin: AdminLogger;
	system: SystemLogger;
	webhook: WebhookLogger;

	child(additionalContext: Partial<LogContext>): Logger;

	getContext(): LogContext;
}

export interface AuthLogger {
	otpSent(data: AuthEventData): void;
	otpVerified(data: AuthEventData): void;
	otpFailed(data: AuthEventData): void;
	loginSuccess(data: AuthEventData): void;
	loginFailed(data: AuthEventData): void;
	sessionCreated(data: AuthEventData): void;
	sessionExpired(data: AuthEventData): void;
	sessionRenewed(data: AuthEventData): void;
	logout(data: AuthEventData): void;
}

export interface OrderLogger {
	created(data: OrderEventData): void;
	updated(data: OrderEventData): void;
	statusChanged(data: OrderEventData): void;
	cancelled(data: OrderEventData): void;
	completed(data: OrderEventData): void;
	viewed(data: OrderEventData): void;
}

export interface PaymentLogger {
	created(data: PaymentEventData): void;
	confirmed(data: PaymentEventData): void;
	failed(data: PaymentEventData): void;
	statusChanged(data: PaymentEventData): void;
	notificationSent(data: PaymentEventData): void;
}

export interface ProductLogger {
	created(data: ProductEventData): void;
	updated(data: ProductEventData): void;
	deleted(data: ProductEventData): void;
	viewed(data: ProductEventData): void;
	searched(data: { query: string; resultCount: number }): void;
}

export interface AdminLogger {
	login(data: AdminEventData): void;
	action(data: AdminEventData): void;
	bulkAction(data: AdminEventData & { count: number }): void;
	syncTriggered(data: { type: string; itemCount?: number }): void;
}

export interface SystemLogger {
	requestStart(data: SystemEventData): void;
	requestEnd(data: SystemEventData): void;
	requestError(data: SystemEventData): void;
	cacheHit(data: SystemEventData): void;
	cacheMiss(data: SystemEventData): void;
	cacheSet(data: SystemEventData): void;
	rateLimited(data: { ip: string; path: string }): void;
}

export interface WebhookLogger {
	received(data: WebhookEventData): void;
	processed(data: WebhookEventData): void;
	failed(data: WebhookEventData): void;
}

import { Context, MiddlewareHandler } from "hono";

//#region src/types.d.ts
type LogLevel = "debug" | "info" | "warn" | "error";
type UserType = "customer" | "admin" | "anonymous" | "system";
interface LogContext {
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
interface LogEntry {
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
type EventCategory = "auth" | "order" | "payment" | "product" | "admin" | "system" | "cache" | "webhook";
type EventData = Record<string, unknown>;
interface AuthEventData extends EventData {
  phone?: number;
  adminId?: string;
  adminEmail?: string;
  attemptCount?: number;
  failureReason?: string;
  sessionId?: string;
}
interface OrderEventData extends EventData {
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
interface PaymentEventData extends EventData {
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
interface ProductEventData extends EventData {
  productId?: number;
  productSlug?: string;
  productName?: string;
  brandId?: number;
  categoryId?: number;
  price?: number;
  action?: string;
}
interface AdminEventData extends EventData {
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: number | string;
  changes?: Record<string, unknown>;
}
interface SystemEventData extends EventData {
  path?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  error?: string;
  cacheKey?: string;
  cacheHit?: boolean;
  cacheTtl?: number;
}
interface WebhookEventData extends EventData {
  provider?: string;
  eventType?: string;
  payloadSize?: number;
  success?: boolean;
  error?: string;
}
interface Logger {
  debug(event: string, data?: Record<string, unknown>): void;
  info(event: string, data?: Record<string, unknown>): void;
  warn(event: string, data?: Record<string, unknown>): void;
  error(event: string, error?: Error | unknown, data?: Record<string, unknown>): void;
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
interface AuthLogger {
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
interface OrderLogger {
  created(data: OrderEventData): void;
  updated(data: OrderEventData): void;
  statusChanged(data: OrderEventData): void;
  cancelled(data: OrderEventData): void;
  completed(data: OrderEventData): void;
  viewed(data: OrderEventData): void;
}
interface PaymentLogger {
  created(data: PaymentEventData): void;
  confirmed(data: PaymentEventData): void;
  failed(data: PaymentEventData): void;
  statusChanged(data: PaymentEventData): void;
  notificationSent(data: PaymentEventData): void;
}
interface ProductLogger {
  created(data: ProductEventData): void;
  updated(data: ProductEventData): void;
  deleted(data: ProductEventData): void;
  viewed(data: ProductEventData): void;
  searched(data: {
    query: string;
    resultCount: number;
  }): void;
}
interface AdminLogger {
  login(data: AdminEventData): void;
  action(data: AdminEventData): void;
  bulkAction(data: AdminEventData & {
    count: number;
  }): void;
  syncTriggered(data: {
    type: string;
    itemCount?: number;
  }): void;
}
interface SystemLogger {
  requestStart(data: SystemEventData): void;
  requestEnd(data: SystemEventData): void;
  requestError(data: SystemEventData): void;
  cacheHit(data: SystemEventData): void;
  cacheMiss(data: SystemEventData): void;
  cacheSet(data: SystemEventData): void;
  rateLimited(data: {
    ip: string;
    path: string;
  }): void;
}
interface WebhookLogger {
  received(data: WebhookEventData): void;
  processed(data: WebhookEventData): void;
  failed(data: WebhookEventData): void;
}
//#endregion
//#region src/context.d.ts
declare function extractClientIp(request: Request): string | undefined;
declare function extractCfContext(request: Request): Pick<LogContext, "rayId" | "colo" | "clientIp">;
declare function createRequestContext(request: Request, options?: {
  requestId?: string;
  userId?: number | string;
  userPhone?: number;
  userEmail?: string;
  userType?: UserType;
}): LogContext;
declare function enrichWithCustomerSession(context: LogContext, session: {
  user: {
    id?: number;
    phone: number;
  };
} | null): LogContext;
declare function enrichWithAdminSession(context: LogContext, session: {
  user: {
    id: string;
    name?: string;
  };
} | null): LogContext;
//#endregion
//#region src/logger.d.ts
declare function createLogger(context: LogContext): Logger;
declare function createMinimalLogger(): Logger;
declare function generateRequestId(): string;
//#endregion
//#region src/middleware.d.ts
declare function getLogger(c: Context): Logger;
declare function getLogContext(c: Context): LogContext | undefined;
declare function setLogger(c: Context, logger: Logger): void;
declare function updateLoggerContext(c: Context, updates: Partial<LogContext>): Logger;
interface LoggerMiddlewareOptions {
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
declare function loggerMiddleware(options?: LoggerMiddlewareOptions): MiddlewareHandler;
declare function createTrpcLoggingMiddleware(getLoggerFromCtx: (ctx: unknown) => Logger | null): <T extends {
  ctx: unknown;
  next: () => Promise<unknown>;
  path: string;
  type: string;
  input: unknown;
}>(opts: T) => Promise<unknown>;
//#endregion
export { type AdminEventData, type AdminLogger, type AuthEventData, type AuthLogger, type EventCategory, type EventData, type LogContext, type LogEntry, type LogLevel, type Logger, type OrderEventData, type OrderLogger, type PaymentEventData, type PaymentLogger, type ProductEventData, type ProductLogger, type SystemEventData, type SystemLogger, type UserType, type WebhookEventData, type WebhookLogger, createLogger, createMinimalLogger, createRequestContext, createTrpcLoggingMiddleware, enrichWithAdminSession, enrichWithCustomerSession, extractCfContext, extractClientIp, generateRequestId, getLogContext, getLogger, loggerMiddleware, setLogger, updateLoggerContext };
//# sourceMappingURL=index.d.ts.map
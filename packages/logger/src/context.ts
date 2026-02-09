import type { LogContext, UserType } from "./types";

export function extractClientIp(request: Request): string | undefined {
	const ip = request.headers.get("cf-connecting-ip");
	if (!ip) return undefined;

	const parts = ip.split(".");
	if (parts.length === 4) {
		return `${parts[0]}.${parts[1]}.x.x`;
	}

	const ipv6Parts = ip.split(":");
	if (ipv6Parts.length > 1) {
		return `${ipv6Parts[0]}:${ipv6Parts[1]}:***`;
	}

	return ip;
}

export function extractCfContext(
	request: Request,
): Pick<LogContext, "rayId" | "colo" | "clientIp"> {
	const cf = (request as Request & { cf?: { colo?: string } }).cf;

	return {
		rayId: request.headers.get("cf-ray") ?? undefined,
		colo: cf?.colo,
		clientIp: extractClientIp(request),
	};
}

export function createRequestContext(
	request: Request,
	options?: {
		requestId?: string;
		userId?: number | string;
		userPhone?: number;
		userEmail?: string;
		userType?: UserType;
	},
): LogContext {
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
		userType: options?.userType ?? "anonymous",
	};
}

export function enrichWithCustomerSession(
	context: LogContext,
	session: { user: { id?: number; phone: number } } | null,
): LogContext {
	if (!session) return context;

	return {
		...context,
		userId: session.user.id,
		userPhone: session.user.phone,
		userType: "customer",
	};
}

export function enrichWithAdminSession(
	context: LogContext,
	session: { user: { id: string; name?: string } } | null,
): LogContext {
	if (!session) return context;

	return {
		...context,
		userId: session.user.id,
		userEmail: session.user.name,
		userType: "admin",
	};
}

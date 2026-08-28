import { createSessionManager } from "~/lib/session/index";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";

const storeSessionManager = createSessionManager<CustomerSessionClaims>({
	kvSessionPrefix: "store_session",
	kvUserSessionPrefix: "store_user_sessions",
	cookieName: "store_session",
	sessionDurationMs: 1000 * 60 * 60 * 24 * 7, // 7 days
	renewalThresholdMs: 1000 * 60 * 30, // 30 minutes
});

const {
	createSession,
	validateSessionToken,
	invalidateSession,
	setSessionTokenCookie,
	deleteSessionTokenCookie,
	auth,
} = storeSessionManager;

export {
	auth,
	createSession,
	deleteSessionTokenCookie,
	invalidateSession,
	setSessionTokenCookie,
};

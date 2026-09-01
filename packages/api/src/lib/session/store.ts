import { createSessionManager } from "~/lib/session/index";
import type { CustomerSessionClaims } from "~/lib/session/checkout-access";

const storeSessionManager = createSessionManager<CustomerSessionClaims>({
	cookieName: "store_session",
	kvSessionPrefix: "store_session",
	kvUserSessionPrefix: "store_user_sessions",
	renewalThresholdMs: 1000 * 60 * 30, // 30 minutes
	sessionDurationMs: 1000 * 60 * 60 * 24 * 7, // 7 days
});

const {
	auth,
	createSession,
	deleteSessionTokenCookie,
	invalidateSession,
	setSessionTokenCookie,
	validateSessionToken,
} = storeSessionManager;

export { auth, createSession, deleteSessionTokenCookie, invalidateSession, setSessionTokenCookie };

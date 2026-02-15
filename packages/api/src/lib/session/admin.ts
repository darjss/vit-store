import { createUserSessionManager } from "./index";

export const adminSessionManager = createUserSessionManager({
	kvSessionPrefix: "admin_session",
	kvUserSessionPrefix: "admin_user_sessions",
	cookieName: "admin_session",
	domainEnvVar: "DOMAIN",
	sessionDurationMs: 1000 * 60 * 60 * 24,
	renewalThresholdMs: 1000 * 60 * 1,
});

export const {
	createSession: createAdminSession,
	validateSessionToken: validateAdminSessionToken,
	invalidateSession: invalidateAdminSession,
	setSessionTokenCookie: setAdminSessionTokenCookie,
	deleteSessionTokenCookie: deleteAdminSessionTokenCookie,
	auth: adminAuth,
} = adminSessionManager;

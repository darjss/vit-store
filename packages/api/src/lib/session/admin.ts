import { createUserSessionManager } from "~/lib/session/index";

const adminSessionManager = createUserSessionManager({
	kvSessionPrefix: "admin_session",
	kvUserSessionPrefix: "admin_user_sessions",
	cookieName: "admin_session",
	sessionDurationMs: 1000 * 60 * 60 * 24,
	renewalThresholdMs: 1000 * 60 * 60 * 2,
});

const {
	createSession: createAdminSession,
	validateSessionToken: validateAdminSessionToken,
	invalidateSession: invalidateAdminSession,
	setSessionTokenCookie: setAdminSessionTokenCookie,
	deleteSessionTokenCookie: deleteAdminSessionTokenCookie,
	auth: adminAuth,
} = adminSessionManager;

export {
	adminAuth,
	createAdminSession,
	deleteAdminSessionTokenCookie,
	invalidateAdminSession,
	setAdminSessionTokenCookie,
};

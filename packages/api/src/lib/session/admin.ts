import { createUserSessionManager } from "~/lib/session/index";

const adminSessionManager = createUserSessionManager({
	kvSessionPrefix: "admin_session",
	kvUserSessionPrefix: "admin_user_sessions",
	cookieName: "admin_session",
	// 30-day rolling session: any activity in the second half of the window
	// (last 15d) extends the session by another 30d, so an active admin stays
	// logged in for up to 30d since their last request. Previously this was 24h
	// with a 2h renewal window, forcing daily re-logins.
	sessionDurationMs: 1000 * 60 * 60 * 24 * 30,
	renewalThresholdMs: 1000 * 60 * 60 * 24 * 15,
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

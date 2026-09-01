import { createUserSessionManager } from "~/lib/session/index";

const adminSessionManager = createUserSessionManager({
	cookieName: "admin_session",
	kvSessionPrefix: "admin_session",
	kvUserSessionPrefix: "admin_user_sessions",
	// 30-day rolling session: any activity in the second half of the window
	// (last 15d) extends the session by another 30d, so an active admin stays
	// logged in for up to 30d since their last request. Previously this was 24h
	// with a 2h renewal window, forcing daily re-logins.
	renewalThresholdMs: 1000 * 60 * 60 * 24 * 15,
	sessionDurationMs: 1000 * 60 * 60 * 24 * 30,
});

const {
	auth: adminAuth,
	createSession: createAdminSession,
	deleteSessionTokenCookie: deleteAdminSessionTokenCookie,
	invalidateSession: invalidateAdminSession,
	setSessionTokenCookie: setAdminSessionTokenCookie,
	validateSessionToken: validateAdminSessionToken,
} = adminSessionManager;

export {
	adminAuth,
	createAdminSession,
	deleteAdminSessionTokenCookie,
	invalidateAdminSession,
	setAdminSessionTokenCookie,
};

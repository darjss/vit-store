import { createSessionManager } from "./index";

// Admin session configuration - shorter duration for security
export const adminSessionManager = createSessionManager({
  kvSessionPrefix: "admin_session",
  kvUserSessionPrefix: "admin_user_sessions",
  cookieName: "admin_session", 
  domainEnvVar: "ADMIN_DOMAIN",
  sessionDurationMs: 1000 * 60 * 60 * 8, // 8 hours
  renewalThresholdMs: 1000 * 60 * 15, // 15 minutes
});

export const {
  createSession: createAdminSession,
  validateSessionToken: validateAdminSessionToken,
  invalidateSession: invalidateAdminSession,
  setSessionTokenCookie: setAdminSessionTokenCookie,
  deleteSessionTokenCookie: deleteAdminSessionTokenCookie,
  auth: adminAuth,
} = adminSessionManager;
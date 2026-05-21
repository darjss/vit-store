const WEBVIEW_USER_AGENT_PATTERNS = [
	/FBAN/i,
	/FBAV/i,
	/Instagram/i,
	/Messenger/i,
	/Line\//i,
	/MicroMessenger/i,
	/\bwv\b/i,
];

export function isRestrictedWebView(userAgent?: string): boolean {
	if (!userAgent && typeof navigator === "undefined") {
		return false;
	}

	const ua = userAgent ?? navigator.userAgent;
	return WEBVIEW_USER_AGENT_PATTERNS.some((pattern) => pattern.test(ua));
}

export function getCurrentCheckoutUrl(): string {
	if (typeof window === "undefined") {
		return "";
	}

	return window.location.href;
}

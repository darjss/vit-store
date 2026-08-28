const STORAGE_KEY = "vit:active-payment";
const TTL_MS = 2 * 60 * 60 * 1000;

export type ActivePayment = {
	paymentNumber: string;
	checkoutToken?: string;
	savedAt: number;
};

export function readActivePayment(): ActivePayment | null {
	if (typeof window === "undefined") return null;
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as ActivePayment;
		if (!parsed.paymentNumber || typeof parsed.savedAt !== "number") {
			return null;
		}
		if (Date.now() - parsed.savedAt > TTL_MS) {
			clearActivePayment();
			return null;
		}
		return parsed;
	} catch {
		clearActivePayment();
		return null;
	}
}

export function writeActivePayment(
	paymentNumber: string,
	checkoutToken?: string,
) {
	if (typeof window === "undefined") return;
	const record: ActivePayment = {
		paymentNumber,
		checkoutToken,
		savedAt: Date.now(),
	};
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function clearActivePayment() {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(STORAGE_KEY);
}

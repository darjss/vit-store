import { createUnion, type InferUnion, is } from "dismatch";

/**
 * Tracks a bank deep link tap from click to outcome. Custom-scheme navigation
 * cannot be observed directly, so the outcome is inferred from page
 * visibility: if the browser is backgrounded shortly after the tap, the bank
 * app took over; if the page is still visible after the timeout, nothing
 * happened and the shopper needs a recovery path.
 */
export const HandoffState = createUnion({
	idle: () => ({}),
	opening: (bank: string, startedAt: number) => ({ bank, startedAt }),
	opened: (bank: string) => ({ bank }),
	failed: (bank: string) => ({ bank }),
});

export type HandoffState = InferUnion<typeof HandoffState>;

/**
 * How long we wait for the browser to be backgrounded before giving up. iOS
 * shows a consent dialog before a webview may open another app, and the page
 * stays visible while it's up — 2.5s produced false `no_handoff` for users
 * who simply took a moment to read and approve the dialog.
 */
export const HANDOFF_TIMEOUT_MS = 8000;

/**
 * Starts visibility-based handoff detection for a tap already moved to
 * `opening`. Returns a cleanup function.
 */
export const watchHandoff = (
	state: Extract<HandoffState, { type: "opening" }>,
	handlers: { onOpened: () => void; onFailed: () => void },
): (() => void) => {
	let done = false;
	const finish = (handler: () => void) => {
		if (done) return;
		done = true;
		document.removeEventListener("visibilitychange", onVisibilityChange);
		window.clearTimeout(timer);
		handler();
	};
	const onVisibilityChange = () => {
		if (!document.hidden) return;
		finish(handlers.onOpened);
	};
	const timer = window.setTimeout(
		() => finish(handlers.onFailed),
		HANDOFF_TIMEOUT_MS - (Date.now() - state.startedAt),
	);
	document.addEventListener("visibilitychange", onVisibilityChange);
	return () => finish(() => {});
};

/** Resets `opened` back to `idle` once the shopper returns from the bank app. */
export const watchReturnFromBankApp = (
	onReturned: () => void,
): (() => void) => {
	const onVisibilityChange = () => {
		if (document.hidden) return;
		document.removeEventListener("visibilitychange", onVisibilityChange);
		onReturned();
	};
	document.addEventListener("visibilitychange", onVisibilityChange);
	return () =>
		document.removeEventListener("visibilitychange", onVisibilityChange);
};

export { is as isHandoffState };

// Guard around Astro's view-transition `navigate()` to prevent the
// `InvalidStateError` ("Transition was aborted because of invalid state")
// that `document.startViewTransition` throws when:
//   1. a second transition is started while one is already in-flight, or
//   2. the document is hidden (e.g. a mobile user switched to a bank app
//      while a polling effect fired `navigate()`).
// See https://github.com/withastro/astro/issues/10830 and
// https://github.com/facebook/react/issues/34098.
//
// Use this for *programmatic / reactive* navigations (effects, polling,
// auth redirects, mutation callbacks) where a duplicate or hidden-tab call
// is a bug. For direct user-gesture navigations that should follow Astro's
// default "abort previous and restart" behavior, call `navigate()` from
// `astro:transitions/client` directly.

let inFlight = false;

if (typeof document !== "undefined") {
	const reset = () => {
		inFlight = false;
	};
	document.addEventListener("astro:after-swap", reset);
	document.addEventListener("astro:page-load", reset);
}

type NavigateOptions = Parameters<
	typeof import("astro:transitions/client")["navigate"]
>[1];

/**
 * Navigate via Astro view transitions, coalescing concurrent calls into the
 * first one and falling back to a plain location assignment when the tab is
 * hidden (view transitions cannot run while the document is not visible).
 */
export async function safeNavigate(href: string, options?: NavigateOptions) {
	if (typeof window === "undefined") return;
	if (inFlight) return;

	// startViewTransition throws InvalidStateError when the document is
	// hidden. A plain location assignment does not use view transitions and
	// is safe to run while the document is not visible, so the user still
	// lands on the target page when they return to the tab.
	if (document.visibilityState === "hidden") {
		window.location.assign(href);
		return;
	}

	inFlight = true;
	try {
		const { navigate } = await import("astro:transitions/client");
		navigate(href, options);
	} finally {
		// Safety net in case the astro:after-swap / astro:page-load events
		// do not fire (e.g. navigate short-circuits or the target opts out
		// of view transitions). 2s covers a typical swap cycle without
		// blocking a genuinely subsequent navigation.
		setTimeout(() => {
			inFlight = false;
		}, 2000);
	}
}

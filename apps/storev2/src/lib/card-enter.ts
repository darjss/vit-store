let observer: IntersectionObserver | undefined;

const onScreen = (element: Element) => {
	const box = element.getBoundingClientRect();
	return (
		box.bottom > 0 && box.top < window.innerHeight && box.right > 0 && box.left < window.innerWidth
	);
};

const reveal = (entries: Array<IntersectionObserverEntry>) => {
	let batch = 0;
	for (const entry of entries) {
		// closest() matches the observed card itself and hands it back typed.
		const card = entry.target.closest<HTMLElement>("[data-card-enter]");
		if (!entry.isIntersecting || !card) {
			continue;
		}
		card.style.setProperty("--card-enter-delay", `${Math.min(batch * 50, 300)}ms`);
		card.dataset.cardEnter = "in";
		batch += 1;
		observer?.unobserve(card);
	}
};

/**
 * Product cards rise in as they scroll or swipe into view, and cards that
 * arrive together cascade 50ms apart. A card already on screen is left alone,
 * so first paint never flickers.
 */
export function enterOnScroll(card: HTMLElement) {
	if (card.dataset.cardEnter || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
		return;
	}
	if (onScreen(card)) {
		card.dataset.cardEnter = "shown";
		return;
	}
	card.dataset.cardEnter = "pending";
	observer ??= new IntersectionObserver(reveal, { rootMargin: "0px 0px -24px 0px" });
	observer.observe(card);
}

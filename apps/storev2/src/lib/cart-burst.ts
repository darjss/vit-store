const BURST_COLORS = [
	"oklch(0.9 0.14 95)",
	"oklch(0.68 0.14 30)",
	"oklch(0.92 0.05 230)",
	"oklch(0.93 0.06 160)",
	"oklch(0.995 0.008 95)",
];

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isVisible = (element: HTMLElement) => {
	const box = element.getBoundingClientRect();
	return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
};

/**
 * The product photo shrinks into whichever cart button is on screen (header on
 * desktop, bottom nav on phones), then the button bumps. The tap visibly lands.
 */
export const flyToCart = (image: HTMLImageElement | null | undefined) => {
	const target = [...document.querySelectorAll<HTMLElement>("[data-cart-target]")].find(isVisible);
	if (!image || !target || reducedMotion()) {
		return;
	}

	const from = image.getBoundingClientRect();
	const to = target.getBoundingClientRect();
	const ghost = document.createElement("img");
	ghost.src = image.currentSrc || image.src;
	ghost.alt = "";
	ghost.className = "cart-fly";
	ghost.setAttribute("aria-hidden", "true");
	Object.assign(ghost.style, {
		height: `${from.height}px`,
		left: `${from.left}px`,
		top: `${from.top}px`,
		width: `${from.width}px`,
	});
	document.body.insertAdjacentElement("beforeend", ghost);

	const dx = to.left + to.width / 2 - (from.left + from.width / 2);
	const dy = to.top + to.height / 2 - (from.top + from.height / 2);
	const flight = ghost.animate(
		[
			{ opacity: 1, transform: "none" },
			{ opacity: 0.5, transform: `translate(${dx}px, ${dy}px) scale(${24 / from.width})` },
		],
		{ duration: 560, easing: "cubic-bezier(0.77, 0, 0.175, 1)" },
	);
	flight.onfinish = () => {
		ghost.remove();
		target.animate([{ transform: "scale(1.2)" }, { transform: "scale(1)" }], {
			duration: 380,
			easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
		});
	};
	flight.oncancel = () => ghost.remove();
};

export const playCartBurst = (target: HTMLElement) => {
	if (reducedMotion()) {
		return;
	}

	const bounds = target.getBoundingClientRect();
	const burst = document.createElement("span");
	burst.className = "cart-add-burst";
	burst.setAttribute("aria-hidden", "true");
	burst.style.left = `${bounds.left + bounds.width / 2}px`;
	burst.style.top = `${bounds.top + bounds.height / 2}px`;

	const particles: Array<HTMLElement> = [];
	for (let index = 0; index < 18; index += 1) {
		const particle = document.createElement("i");
		const angle = (Math.PI * 2 * index) / 18;
		const distance = 55 + Math.random() * 70;
		particle.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
		particle.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
		particle.style.setProperty("--burst-rotate", `${Math.random() * 540 - 270}deg`);
		particle.style.setProperty(
			"--burst-color",
			BURST_COLORS[index % BURST_COLORS.length] ?? BURST_COLORS[0],
		);
		particles.push(particle);
	}

	burst.replaceChildren(...particles);
	document.body.insertAdjacentElement("beforeend", burst);
	window.setTimeout(() => burst.remove(), 900);
};

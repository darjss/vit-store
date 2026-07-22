const BURST_COLORS = [
	"oklch(0.9 0.14 95)",
	"oklch(0.68 0.14 30)",
	"oklch(0.92 0.05 230)",
	"oklch(0.93 0.06 160)",
];

export const playCartBurst = (target: HTMLElement) => {
	if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

	const bounds = target.getBoundingClientRect();
	const burst = document.createElement("span");
	burst.className = "cart-add-burst";
	burst.setAttribute("aria-hidden", "true");
	burst.style.left = `${bounds.left + bounds.width / 2}px`;
	burst.style.top = `${bounds.top + bounds.height / 2}px`;

	for (let index = 0; index < 12; index += 1) {
		const particle = document.createElement("i");
		const angle = (Math.PI * 2 * index) / 12;
		const distance = 34 + (index % 3) * 8;
		particle.style.setProperty("--burst-x", `${Math.cos(angle) * distance}px`);
		particle.style.setProperty("--burst-y", `${Math.sin(angle) * distance}px`);
		particle.style.setProperty("--burst-rotate", `${index * 47}deg`);
		particle.style.setProperty(
			"--burst-color",
			BURST_COLORS[index % BURST_COLORS.length] ?? BURST_COLORS[0],
		);
		burst.appendChild(particle);
	}

	document.body.appendChild(burst);
	window.setTimeout(() => burst.remove(), 700);
};

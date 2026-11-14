import { SALE_CAMPAIGN } from "@vit/shared/domain/product";

const end = Date.parse(SALE_CAMPAIGN.end);

const dayMonth = (iso: string) =>
	new Date(iso)
		.toLocaleDateString("en-US", { day: "2-digit", month: "2-digit", timeZone: "Asia/Ulaanbaatar" })
		.replace("/", ".");

/** "11.14 – 11.30", read in Ulaanbaatar time. */
export const campaignDates = `${dayMonth(SALE_CAMPAIGN.start)} – ${dayMonth(SALE_CAMPAIGN.end)}`;

export const isCampaignLive = (now = Date.now()) => now <= end;

const pad = (value: number) => String(value).padStart(2, "0");

const timeLeft = (now: number) => {
	const seconds = Math.max(0, Math.floor((end - now) / 1000));
	return new Map([
		["d", pad(Math.floor(seconds / 86_400))],
		["h", pad(Math.floor(seconds / 3600) % 24)],
		["m", pad(Math.floor(seconds / 60) % 60)],
		["s", pad(seconds % 60)],
	]);
};

let timer: number | undefined;

/**
 * Ticks every `[data-countdown] [data-unit]` and hides `[data-campaign-live]`
 * once the campaign ends. Pages are prerendered, so the markup carries no time
 * and this fills it on every page load. A changed digit rolls up into place.
 */
export function startCampaignClocks() {
	window.clearInterval(timer);
	const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const tick = () => {
		const now = Date.now();
		for (const element of document.querySelectorAll<HTMLElement>("[data-campaign-live]")) {
			element.hidden = !isCampaignLive(now);
		}
		const left = timeLeft(now);
		for (const unit of document.querySelectorAll<HTMLElement>("[data-countdown] [data-unit]")) {
			const next = left.get(unit.dataset.unit ?? "");
			if (next === undefined || unit.textContent === next) {
				continue;
			}
			unit.textContent = next;
			if (!calm) {
				unit.animate(
					[
						{ filter: "blur(2px)", opacity: 0, transform: "translateY(45%)" },
						{ filter: "blur(0)", opacity: 1, transform: "none" },
					],
					{ duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
				);
			}
		}
	};
	tick();
	timer = window.setInterval(tick, 1000);
}

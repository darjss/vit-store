export type CelebrationIntensity = "light" | "strong";

const STORAGE_PREFIX = "celebrate:";

const COLORS = [
	"#f5d76e",
	"#e8c04a",
	"#f0c9a0",
	"#f0c4c8",
	"#b8e0c8",
	"#f5e8a0",
	"#e8d4a8",
];

const inMemoryFired = new Set<string>();

type Particle = {
	x: number;
	y: number;
	vx: number;
	vy: number;
	w: number;
	h: number;
	rotation: number;
	vr: number;
	color: string;
	opacity: number;
	shape: "rect" | "circle";
};

function prefersReducedMotion(): boolean {
	if (typeof window === "undefined") return true;
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasFired(key: string): boolean {
	const storageKey = STORAGE_PREFIX + key;
	if (inMemoryFired.has(storageKey)) return true;
	if (typeof window === "undefined") return true;
	try {
		return sessionStorage.getItem(storageKey) === "1";
	} catch {
		return false;
	}
}

function markFired(key: string): void {
	const storageKey = STORAGE_PREFIX + key;
	inMemoryFired.add(storageKey);
	if (typeof window === "undefined") return;
	try {
		sessionStorage.setItem(storageKey, "1");
	} catch {
		// private mode / quota — in-memory still prevents re-fire this page life
	}
}

function rand(min: number, max: number): number {
	return min + Math.random() * (max - min);
}

function pickColor(): string {
	return COLORS[(Math.random() * COLORS.length) | 0]!;
}

function spawnParticles(
	count: number,
	originX: number,
	originY: number,
	spread: number,
): Particle[] {
	const particles: Particle[] = [];
	for (let i = 0; i < count; i++) {
		const angle = rand(-Math.PI * 0.85, -Math.PI * 0.15);
		const speed = rand(4, spread);
		const size = rand(5, 10);
		particles.push({
			x: originX + rand(-24, 24),
			y: originY + rand(-8, 8),
			vx: Math.cos(angle) * speed + rand(-1.5, 1.5),
			vy: Math.sin(angle) * speed,
			w: size,
			h: size * rand(0.45, 1.15),
			rotation: rand(0, Math.PI * 2),
			vr: rand(-0.18, 0.18),
			color: pickColor(),
			opacity: 1,
			shape: Math.random() > 0.35 ? "rect" : "circle",
		});
	}
	return particles;
}

function runCanvasBurst(intensity: CelebrationIntensity): void {
	const w = window.innerWidth;
	const h = window.innerHeight;
	const dpr = Math.min(window.devicePixelRatio || 1, 2);

	const canvas = document.createElement("canvas");
	canvas.setAttribute("aria-hidden", "true");
	canvas.style.cssText =
		"position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
	canvas.width = Math.floor(w * dpr);
	canvas.height = Math.floor(h * dpr);

	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	ctx.scale(dpr, dpr);
	document.body.appendChild(canvas);

	const isStrong = intensity === "strong";
	const count = isStrong
		? Math.min(110, Math.floor(w / 6) + 40)
		: Math.min(48, Math.floor(w / 12) + 18);
	const durationMs = isStrong ? 2200 : 1500;
	const gravity = isStrong ? 0.14 : 0.12;
	const drag = 0.992;

	const originX = w * 0.5;
	const originY = h * (isStrong ? 0.28 : 0.22);
	const particles = spawnParticles(count, originX, originY, isStrong ? 14 : 9);

	if (isStrong) {
		particles.push(
			...spawnParticles(Math.floor(count * 0.35), w * 0.18, h * 0.35, 10),
			...spawnParticles(Math.floor(count * 0.35), w * 0.82, h * 0.35, 10),
		);
	}

	const start = performance.now();
	let frame = 0;

	const tick = (now: number) => {
		const elapsed = now - start;
		const t = Math.min(1, elapsed / durationMs);
		const fade = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;

		ctx.clearRect(0, 0, w, h);

		for (const p of particles) {
			p.vx *= drag;
			p.vy = p.vy * drag + gravity;
			p.x += p.vx;
			p.y += p.vy;
			p.rotation += p.vr;
			p.opacity = fade;

			if (p.opacity <= 0.02) continue;

			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.globalAlpha = p.opacity;
			ctx.fillStyle = p.color;
			if (p.shape === "circle") {
				ctx.beginPath();
				ctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2);
				ctx.fill();
			} else {
				ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
			}
			ctx.restore();
		}

		if (t < 1) {
			frame = requestAnimationFrame(tick);
		} else {
			canvas.remove();
		}
	};

	frame = requestAnimationFrame(tick);

	window.setTimeout(() => {
		cancelAnimationFrame(frame);
		if (canvas.isConnected) canvas.remove();
	}, durationMs + 400);
}

export function celebrateOnce(
	key: string,
	intensity: CelebrationIntensity = "strong",
): boolean {
	if (typeof window === "undefined") return false;
	if (hasFired(key)) return false;
	markFired(key);
	if (prefersReducedMotion()) return false;
	runCanvasBurst(intensity);
	return true;
}

export function orderCreatedCelebrationKey(paymentNumber: string): string {
	return `order-created:${paymentNumber}`;
}

export function paymentSuccessCelebrationKey(paymentNumber: string): string {
	return `payment-success:${paymentNumber}`;
}

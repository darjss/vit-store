import { Show } from "solid-js";
import { cn } from "@/lib/utils";

/**
 * Branded monogram fallback shown when a product has no image.
 *
 * Renders the product's initials over a faint brand/category label.
 * The surrounding surface is expected to supply the branded background
 * color and dot pattern (see home/server product cards and carousel);
 * this component stays transparent so it layers cleanly on top.
 */

export interface ProductImageFallbackProps {
	name: string;
	brand?: string | null;
	category?: string | null;
	class?: string;
}

/**
 * Build a 1-2 character monogram from a product name.
 * Skips common filler words, keeps the first letter of the first
 * two significant words, uppercased. Falls back to the first
 * alphanumeric character of the name.
 */
export function getProductMonogram(name: string): string {
	const FILLER = new Set([
		"the",
		"a",
		"an",
		"of",
		"and",
		"with",
		"for",
		"by",
		"vitamin",
		"vit",
		"supplement",
		"caps",
		"capsules",
		"tablets",
		"softgels",
		"gummies",
		"mg",
		"mcg",
	]);

	const words = name
		.replace(/[^\p{L}\p{N}\s]/gu, " ")
		.split(/\s+/)
		.map((w) => w.trim())
		.filter((w) => w.length > 0 && !FILLER.has(w.toLowerCase()));

	const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
	if (letters.length > 0) return letters.join("");

	const firstAlpha = name.match(/\p{L}|\p{N}/u);
	return firstAlpha ? firstAlpha[0]!.toUpperCase() : "?";
}

export default function ProductImageFallback(props: ProductImageFallbackProps) {
	const monogram = () => getProductMonogram(props.name);
	const label = () => props.category ?? props.brand ?? null;

	return (
		<div
			class={cn(
				"absolute inset-0 flex flex-col items-center justify-center gap-1 p-3 text-center",
				props.class,
			)}
			aria-hidden="true"
		>
			<span class="select-none font-black uppercase leading-none tracking-tight text-foreground/70 text-4xl sm:text-5xl md:text-6xl">
				{monogram()}
			</span>
			<Show when={label()}>
				<span class="line-clamp-1 max-w-full text-[9px] font-bold uppercase tracking-widest text-foreground/50 sm:text-[10px]">
					{label()}
				</span>
			</Show>
		</div>
	);
}

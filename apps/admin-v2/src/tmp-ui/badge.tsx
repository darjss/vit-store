// TODO: SWAP TO @vit/ui — temporary local stub.
// Status pill: tone + icon + label. Every status carries text AND an icon
// (never color alone). No blue or green tones.
import type { JSX } from "solid-js";

import { cn } from "@/lib/utils";

export type BadgeTone =
	| "lemon"
	| "apricot"
	| "lavender"
	| "coral"
	| "gray"
	| "outline";

const toneClass: Record<BadgeTone, string> = {
	lemon: "bg-lemon text-lemon-ink",
	apricot: "bg-apricot text-apricot-ink",
	lavender: "bg-lavender text-lavender-ink",
	coral: "bg-coral text-coral-ink",
	gray: "bg-gray text-gray-ink",
	outline: "border border-dashed border-coral text-coral-ink",
};

export function Badge(props: {
	tone: BadgeTone;
	icon?: JSX.Element;
	class?: string;
	children: JSX.Element;
}) {
	return (
		<span
			class={cn(
				"inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-bold text-xs leading-[1.6]",
				toneClass[props.tone],
				props.class,
			)}
		>
			{props.icon && (
				<span class="shrink-0 [&_svg]:size-[11px]" aria-hidden="true">
					{props.icon}
				</span>
			)}
			<span>{props.children}</span>
		</span>
	);
}

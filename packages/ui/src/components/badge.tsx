import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

/*
 * Status badge tones — the approved admin palette. No blue, no green.
 * Status always carries text; pass an `icon` for the text+icon pairing the
 * admin requires (every status has text and an icon, never colour alone).
 */
const badgeVariants = cva(
	"ui-motion inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 font-bold text-xs leading-6 [&_svg]:size-3 [&_svg]:shrink-0",
	{
		variants: {
			tone: {
				default: "bg-gray text-gray-ink",
				butter: "bg-butter text-butter-ink",
				lavender: "bg-lavender text-lavender-ink",
				apricot: "bg-apricot text-apricot-ink",
				coral: "bg-coral text-coral-ink",
				lemon: "bg-lemon text-lemon-ink",
				gray: "bg-gray text-gray-ink",
				outline:
					"border border-coral border-dashed bg-transparent text-coral-ink",
			},
		},
		defaultVariants: {
			tone: "gray",
		},
	},
);

type BadgeProps = VariantProps<typeof badgeVariants> & {
	class?: string;
	icon?: JSX.Element;
	children?: JSX.Element;
};

const Badge = (props: BadgeProps) => {
	const [local, others] = splitProps(props, ["tone", "class", "icon", "children"]);
	return (
		<span
			class={cn(badgeVariants({ tone: local.tone }), local.class)}
			{...others}
		>
			{local.icon ? <span aria-hidden="true">{local.icon}</span> : null}
			{local.children}
		</span>
	);
};

export { Badge, badgeVariants };
export type { BadgeProps };

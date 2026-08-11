// TODO: SWAP TO @vit/ui — temporary local stub.
// Inline alert: icon + message, role="alert" for errors, role="status"
// otherwise so dynamic content announces (better-accessibility).

import { ClockCircleIcon } from "@solar-icons/solid/linear/clock-circle";
import { DangerTriangleIcon } from "@solar-icons/solid/linear/danger-triangle";
import { InfoCircleIcon } from "@solar-icons/solid/linear/info-circle";
import type { JSX } from "solid-js";

import { cn } from "@/lib/utils";

export type InlineAlertVariant = "error" | "warning" | "info";

const variantClass: Record<InlineAlertVariant, string> = {
	error: "border-coral/40 bg-coral/10 text-coral-ink",
	warning: "border-apricot/70 bg-apricot/25 text-apricot-ink",
	info: "border-lavender/60 bg-lavender/20 text-lavender-ink",
};

const variantIcon: Record<InlineAlertVariant, JSX.Element> = {
	error: <DangerTriangleIcon />,
	warning: <ClockCircleIcon />,
	info: <InfoCircleIcon />,
};

export function InlineAlert(props: {
	variant?: InlineAlertVariant;
	class?: string;
	children: JSX.Element;
}) {
	const variant = () => props.variant ?? "info";
	return (
		<div
			role={variant() === "error" ? "alert" : "status"}
			class={cn(
				"flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 font-medium text-sm leading-relaxed",
				variantClass[variant()],
				props.class,
			)}
		>
			<span class="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden="true">
				{variantIcon[variant()]}
			</span>
			<span>{props.children}</span>
		</div>
	);
}

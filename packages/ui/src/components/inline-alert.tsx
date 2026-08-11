import { CheckCircleIcon } from "@solar-icons/solid/bold/check-circle";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { DangerCircleIcon } from "@solar-icons/solid/linear/danger-circle";
import { InfoCircleIcon } from "@solar-icons/solid/linear/info-circle";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

/*
 * Inline alert — quiet tinted surface, tone-ink icon, ink text. Tones map to
 * the admin status palette (no blue, no green). Error alerts announce
 * themselves; the rest announce politely.
 */
const inlineAlertVariants = cva(
	"ui-motion flex items-start gap-2.5 rounded-ui border px-4 py-3",
	{
		variants: {
			tone: {
				info: "border-lavender/50 bg-lavender/20",
				warning: "border-apricot/60 bg-apricot/25",
				error: "border-coral/50 bg-coral/20",
				success: "border-lemon/60 bg-lemon/30",
			},
		},
		defaultVariants: {
			tone: "info",
		},
	},
);

type InlineAlertProps = VariantProps<typeof inlineAlertVariants> & {
	class?: string;
	title?: JSX.Element;
	children?: JSX.Element;
};

const InlineAlert = (props: InlineAlertProps) => {
	const [local, others] = splitProps(props, [
		"tone",
		"class",
		"title",
		"children",
	]);
	const tone = local.tone ?? "info";
	return (
		<div
			role={tone === "error" ? "alert" : "status"}
			class={cn(inlineAlertVariants({ tone }), local.class)}
			{...others}
		>
			<span
				aria-hidden="true"
				class={cn(
					"mt-0.5 shrink-0",
					tone === "info" && "text-lavender-ink",
					tone === "warning" && "text-apricot-ink",
					tone === "error" && "text-coral-ink",
					tone === "success" && "text-lemon-ink",
				)}
			>
				{tone === "info" ? <InfoCircleIcon class="size-5" /> : null}
				{tone === "warning" ? <DangerCircleIcon class="size-5" /> : null}
				{tone === "error" ? <CloseCircleIcon class="size-5" /> : null}
				{tone === "success" ? <CheckCircleIcon class="size-5" /> : null}
			</span>
			<div class="grid gap-1 text-ink text-sm leading-relaxed">
				{local.title ? <strong class="font-bold">{local.title}</strong> : null}
				{local.children}
			</div>
		</div>
	);
};

export { InlineAlert, inlineAlertVariants };
export type { InlineAlertProps };

import type { JSX } from "solid-js";
import { createUniqueId, splitProps } from "solid-js";

import { cn } from "../lib/cn";

/*
 * FormSection — one labelled group inside a form. Renders an aria-labelledby
 * section with a heading and optional description; children lay out in a
 * single-column grid the caller fills.
 */
type FormSectionProps = {
	class?: string;
	title: JSX.Element;
	description?: JSX.Element;
	children?: JSX.Element;
};

const FormSection = (props: FormSectionProps) => {
	const [local, others] = splitProps(props, [
		"class",
		"title",
		"description",
		"children",
	]);
	const headingId = createUniqueId();
	return (
		<section
			aria-labelledby={headingId}
			class={cn("grid gap-4", local.class)}
			{...others}
		>
			<div class="grid gap-1">
				<h3 id={headingId} class="font-bold text-ink text-sm">
					{local.title}
				</h3>
				{local.description ? (
					<p class="text-ink-2 text-xs leading-relaxed">{local.description}</p>
				) : null}
			</div>
			{local.children}
		</section>
	);
};

export { FormSection };
export type { FormSectionProps };

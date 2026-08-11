import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

const buttonVariants = cva(
	"ui-motion inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-ui font-bold transition-[background-color,border-color,box-shadow,color,transform] duration-[140ms] ease-out focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 active:scale-[0.96] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				primary:
					"bg-butter text-butter-ink shadow-lift hover:bg-butter-strong active:shadow-none",
				secondary:
					"border border-rule bg-surface text-ink shadow-card hover:bg-surface-2",
				outline:
					"border-2 border-ink/20 bg-transparent text-ink hover:border-ink/40",
				ghost: "bg-transparent text-ink hover:bg-surface-2",
				destructive: "bg-coral text-coral-ink hover:brightness-[0.96]",
				dark: "bg-ink text-canvas hover:bg-ink/90",
			},
			size: {
				default: "h-12 px-5 text-sm",
				sm: "h-11 px-4 text-sm",
				lg: "h-14 px-7 text-base",
				icon: "size-11",
				compact: "h-10 px-3.5 text-xs",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "default",
		},
	},
);

type ButtonProps<T extends ValidComponent = "button"> =
	ButtonPrimitive.ButtonRootProps<T> &
		VariantProps<typeof buttonVariants> & {
			class?: string;
			children?: JSX.Element;
			loading?: boolean;
		};

const Button = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, ButtonProps<T>>,
) => {
	const [local, others] = splitProps(props as ButtonProps, [
		"variant",
		"size",
		"class",
		"loading",
		"children",
	]);
	return (
		<ButtonPrimitive.Root
			class={cn(
				buttonVariants({ variant: local.variant, size: local.size }),
				local.class,
			)}
			aria-busy={local.loading || undefined}
			disabled={local.loading || others.disabled}
			{...others}
		>
			{local.loading ? (
				<span
					aria-hidden="true"
					class="ui-spinner size-4 shrink-0 rounded-full border-2 border-current border-t-transparent"
				/>
			) : null}
			{local.children}
		</ButtonPrimitive.Root>
	);
};

type IconButtonProps<T extends ValidComponent = "button"> = ButtonProps<T> & {
	label: string;
};

const IconButton = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, IconButtonProps<T>>,
) => {
	const [local, others] = splitProps(props as IconButtonProps, [
		"variant",
		"size",
		"class",
		"loading",
		"children",
		"label",
	]);
	return (
		<ButtonPrimitive.Root
			class={cn(
				buttonVariants({ variant: local.variant, size: "icon" }),
				local.class,
			)}
			aria-busy={local.loading || undefined}
			aria-label={local.label}
			disabled={local.loading || others.disabled}
			title={local.label}
			{...others}
		>
			{local.loading ? (
				<span
					aria-hidden="true"
					class="ui-spinner size-4 rounded-full border-2 border-current border-t-transparent"
				/>
			) : null}
			{local.children}
		</ButtonPrimitive.Root>
	);
};

export { Button, buttonVariants, IconButton };
export type { ButtonProps, IconButtonProps };

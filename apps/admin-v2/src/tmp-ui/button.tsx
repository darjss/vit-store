// TODO: SWAP TO @vit/ui — temporary local stub.
// Contract: variant (primary/secondary/dark/ghost/destructive), size
// (md/sm/icon), polymorphic via Kobalte Root + asChild. @vit/ui's Button
// (extracted from apps/storev2) accepts the same props.

import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-[10px] font-bold transition-[transform,background-color,border-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				primary: "bg-butter text-ink shadow-card hover:bg-butter-strong",
				secondary:
					"border border-rule bg-surface text-ink shadow-card hover:bg-surface-2",
				dark: "bg-ink text-white hover:bg-[#3a3022] focus-visible:outline-butter",
				ghost: "text-ink hover:bg-surface-2",
				destructive:
					"border border-coral/40 bg-surface text-coral-ink hover:bg-coral/10",
			},
			size: {
				md: "min-h-[46px] px-5 text-sm",
				sm: "min-h-[42px] px-4 text-[13px]",
				icon: "size-11",
			},
		},
		defaultVariants: {
			variant: "primary",
			size: "md",
		},
	},
);

type ButtonProps<T extends ValidComponent = "button"> =
	ButtonPrimitive.ButtonRootProps<T> &
		VariantProps<typeof buttonVariants> & {
			class?: string | undefined;
			children?: JSX.Element;
		};

const Button = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, ButtonProps<T>>,
) => {
	const [local, others] = splitProps(props as ButtonProps, [
		"variant",
		"size",
		"class",
	]);
	return (
		<ButtonPrimitive.Root
			class={cn(
				buttonVariants({ variant: local.variant, size: local.size }),
				local.class,
			)}
			{...others}
		/>
	);
};

export { Button, buttonVariants };
export type { ButtonProps };

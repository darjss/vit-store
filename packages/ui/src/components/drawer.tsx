import * as DialogPrimitive from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

/*
 * Drawer — Kobalte Dialog styled as a sheet. Bottom sheet on mobile (the
 * storefront pattern: grab handle, rounded top, safe-area padding); side
 * drawer on desktop via `side="right"`.
 */
const Drawer = DialogPrimitive.Root;
const DrawerTrigger = DialogPrimitive.Trigger;
const DrawerPortal = DialogPrimitive.Portal;
const DrawerClose = DialogPrimitive.CloseButton;

type DrawerOverlayProps<T extends ValidComponent = "div"> =
	DialogPrimitive.DialogOverlayProps<T> & { class?: string };

const DrawerOverlay = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DrawerOverlayProps<T>>,
) => {
	const [local, others] = splitProps(props as DrawerOverlayProps, ["class"]);
	return (
		<DialogPrimitive.Overlay
			class={cn("ui-enter-fade fixed inset-0 z-50 bg-ink/50", local.class)}
			{...others}
		/>
	);
};

type DrawerContentProps<T extends ValidComponent = "div"> =
	DialogPrimitive.DialogContentProps<T> & {
		class?: string;
		side?: "bottom" | "right";
		children?: JSX.Element;
	};

const DrawerContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DrawerContentProps<T>>,
) => {
	const [local, others] = splitProps(props as DrawerContentProps, [
		"class",
		"side",
		"children",
	]);
	const side = local.side ?? "bottom";
	return (
		<DialogPrimitive.Portal>
			<DrawerOverlay />
			<DialogPrimitive.Content
				class={cn(
					side === "bottom"
						? "ui-enter-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-t-2xl border-rule border-t bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] outline-none"
						: "ui-enter-right fixed inset-y-0 right-0 z-50 flex h-full w-[min(100%,28rem)] flex-col gap-4 overflow-y-auto rounded-l-2xl border-rule border-l bg-surface p-6 outline-none",
					local.class,
				)}
				{...others}
			>
				{side === "bottom" ? (
					<div
						aria-hidden="true"
						class="mx-auto mb-1 h-1.5 w-12 shrink-0 rounded-full bg-gray"
					/>
				) : null}
				{local.children}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
};

type DrawerHeaderProps = {
	class?: string;
	children?: JSX.Element;
};

const DrawerHeader = (props: DrawerHeaderProps) => {
	const [local, others] = splitProps(props, ["class", "children"]);
	return (
		<div class={cn("flex flex-col gap-1", local.class)} {...others}>
			{local.children}
		</div>
	);
};

type DrawerFooterProps = {
	class?: string;
	children?: JSX.Element;
};

const DrawerFooter = (props: DrawerFooterProps) => {
	const [local, others] = splitProps(props, ["class", "children"]);
	return (
		<div class={cn("flex flex-col gap-2", local.class)} {...others}>
			{local.children}
		</div>
	);
};

type DrawerTitleProps<T extends ValidComponent = "h2"> =
	DialogPrimitive.DialogTitleProps<T> & { class?: string };

const DrawerTitle = <T extends ValidComponent = "h2">(
	props: PolymorphicProps<T, DrawerTitleProps<T>>,
) => {
	const [local, others] = splitProps(props as DrawerTitleProps, ["class"]);
	return (
		<DialogPrimitive.Title
			class={cn("font-bold text-ink text-lg leading-tight", local.class)}
			{...others}
		/>
	);
};

type DrawerDescriptionProps<T extends ValidComponent = "p"> =
	DialogPrimitive.DialogDescriptionProps<T> & { class?: string };

const DrawerDescription = <T extends ValidComponent = "p">(
	props: PolymorphicProps<T, DrawerDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(props as DrawerDescriptionProps, [
		"class",
	]);
	return (
		<DialogPrimitive.Description
			class={cn("text-ink-2 text-sm leading-relaxed", local.class)}
			{...others}
		/>
	);
};

export {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerOverlay,
	DrawerPortal,
	DrawerTitle,
	DrawerTrigger,
};
export type {
	DrawerContentProps,
	DrawerDescriptionProps,
	DrawerFooterProps,
	DrawerHeaderProps,
	DrawerOverlayProps,
	DrawerTitleProps,
};

import * as DialogPrimitive from "@kobalte/core/dialog";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;

type DialogOverlayProps<T extends ValidComponent = "div"> =
	DialogPrimitive.DialogOverlayProps<T> & { class?: string };

const DialogOverlay = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DialogOverlayProps<T>>,
) => {
	const [local, others] = splitProps(props as DialogOverlayProps, ["class"]);
	return (
		<DialogPrimitive.Overlay
			class={cn("ui-enter-fade fixed inset-0 z-50 bg-ink/50", local.class)}
			{...others}
		/>
	);
};

type DialogContentProps<T extends ValidComponent = "div"> =
	DialogPrimitive.DialogContentProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const DialogContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, DialogContentProps<T>>,
) => {
	const [local, others] = splitProps(props as DialogContentProps, [
		"class",
		"children",
	]);
	return (
		<DialogPrimitive.Portal>
			<DialogOverlay />
			<DialogPrimitive.Content
				class={cn(
					"ui-enter-zoom -translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md gap-4 rounded-2xl border border-rule bg-surface p-6 shadow-pop outline-none",
					local.class,
				)}
				{...others}
			>
				{local.children}
			</DialogPrimitive.Content>
		</DialogPrimitive.Portal>
	);
};

type DialogHeaderProps = {
	class?: string;
	children?: JSX.Element;
};

const DialogHeader = (props: DialogHeaderProps) => {
	const [local, others] = splitProps(props, ["class", "children"]);
	return (
		<div class={cn("flex flex-col gap-1", local.class)} {...others}>
			{local.children}
		</div>
	);
};

type DialogFooterProps = {
	class?: string;
	children?: JSX.Element;
};

const DialogFooter = (props: DialogFooterProps) => {
	const [local, others] = splitProps(props, ["class", "children"]);
	return (
		<div
			class={cn(
				"flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
				local.class,
			)}
			{...others}
		>
			{local.children}
		</div>
	);
};

type DialogTitleProps<T extends ValidComponent = "h2"> =
	DialogPrimitive.DialogTitleProps<T> & { class?: string };

const DialogTitle = <T extends ValidComponent = "h2">(
	props: PolymorphicProps<T, DialogTitleProps<T>>,
) => {
	const [local, others] = splitProps(props as DialogTitleProps, ["class"]);
	return (
		<DialogPrimitive.Title
			class={cn("font-bold text-ink text-lg leading-tight", local.class)}
			{...others}
		/>
	);
};

type DialogDescriptionProps<T extends ValidComponent = "p"> =
	DialogPrimitive.DialogDescriptionProps<T> & { class?: string };

const DialogDescription = <T extends ValidComponent = "p">(
	props: PolymorphicProps<T, DialogDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(props as DialogDescriptionProps, [
		"class",
	]);
	return (
		<DialogPrimitive.Description
			class={cn("text-ink-2 text-sm leading-relaxed", local.class)}
			{...others}
		/>
	);
};

type DialogCloseButtonProps<T extends ValidComponent = "button"> =
	DialogPrimitive.DialogCloseButtonProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const DialogCloseButton = <T extends ValidComponent = "button">(
	rawProps: PolymorphicProps<T, DialogCloseButtonProps<T>>,
) => {
	const props = rawProps as DialogCloseButtonProps;
	const [local, others] = splitProps(props, [
		"class",
		"aria-label",
		"children",
	]);
	return (
		<DialogPrimitive.CloseButton
			class={cn(
				"ui-motion absolute top-3 right-3 inline-flex size-11 items-center justify-center rounded-ui text-ink-2 transition-colors duration-[140ms] ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
				local.class,
			)}
			aria-label={local["aria-label"] ?? "Close"}
			{...others}
		>
			{local.children ?? <CloseCircleIcon class="size-5" />}
		</DialogPrimitive.CloseButton>
	);
};

export {
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
export type {
	DialogCloseButtonProps,
	DialogContentProps,
	DialogDescriptionProps,
	DialogFooterProps,
	DialogHeaderProps,
	DialogOverlayProps,
	DialogTitleProps,
};

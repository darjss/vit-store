import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as ToastPrimitive from "@kobalte/core/toast";
import { CheckCircleIcon } from "@solar-icons/solid/bold/check-circle";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { InfoCircleIcon } from "@solar-icons/solid/linear/info-circle";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { Match, Show, Switch, splitProps } from "solid-js";
import { Portal } from "solid-js/web";

import { cn } from "../lib/cn";

/*
 * Toast tones follow the admin status palette: no blue, no green.
 * success → lemon, error → coral, info → lavender. Every tone carries an icon
 * so colour is never the only cue.
 */
const toastVariants = cva(
	"ui-enter-rise pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-ui border p-4 pr-11 shadow-pop",
	{
		variants: {
			variant: {
				default: "border-rule bg-surface text-ink",
				success: "border-lemon/70 bg-lemon text-lemon-ink",
				error: "border-coral/70 bg-coral text-coral-ink",
				info: "border-lavender/70 bg-lavender text-lavender-ink",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);
type ToastVariant = NonNullable<VariantProps<typeof toastVariants>["variant"]>;

type ToasterProps<T extends ValidComponent = "ol"> =
	ToastPrimitive.ToastListProps<T> & { class?: string };

const Toaster = <T extends ValidComponent = "ol">(
	props: PolymorphicProps<T, ToasterProps<T>>,
) => {
	const [local, others] = splitProps(props as ToasterProps, ["class"]);
	return (
		<Portal>
			<ToastPrimitive.Region>
				<ToastPrimitive.List
					class={cn(
						"fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:top-auto sm:right-4 sm:bottom-4 sm:w-auto sm:max-w-sm sm:flex-col",
						local.class,
					)}
					{...others}
				/>
			</ToastPrimitive.Region>
		</Portal>
	);
};

type ToastRootProps<T extends ValidComponent = "li"> =
	ToastPrimitive.ToastRootProps<T> &
		VariantProps<typeof toastVariants> & {
			class?: string;
			children?: JSX.Element;
		};

const Toast = <T extends ValidComponent = "li">(
	props: PolymorphicProps<T, ToastRootProps<T>>,
) => {
	const [local, others] = splitProps(props as ToastRootProps, [
		"class",
		"variant",
		"children",
	]);
	return (
		<ToastPrimitive.Root
			class={cn(toastVariants({ variant: local.variant }), local.class)}
			{...others}
		>
			<Show when={local.variant !== "default"}>
				<span aria-hidden="true" class="mt-0.5 shrink-0">
					<Switch>
						<Match when={local.variant === "success"}>
							<CheckCircleIcon class="size-5" />
						</Match>
						<Match when={local.variant === "error"}>
							<CloseCircleIcon class="size-5" />
						</Match>
						<Match when={local.variant === "info"}>
							<InfoCircleIcon class="size-5" />
						</Match>
					</Switch>
				</span>
			</Show>
			{local.children}
		</ToastPrimitive.Root>
	);
};

type ToastTitleProps<T extends ValidComponent = "div"> =
	ToastPrimitive.ToastTitleProps<T> & { class?: string };

const ToastTitle = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ToastTitleProps<T>>,
) => {
	const [local, others] = splitProps(props as ToastTitleProps, ["class"]);
	return (
		<ToastPrimitive.Title
			class={cn("font-bold text-sm", local.class)}
			{...others}
		/>
	);
};

type ToastDescriptionProps<T extends ValidComponent = "div"> =
	ToastPrimitive.ToastDescriptionProps<T> & { class?: string };

const ToastDescription = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ToastDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(props as ToastDescriptionProps, ["class"]);
	return (
		<ToastPrimitive.Description
			class={cn("text-sm opacity-80", local.class)}
			{...others}
		/>
	);
};

type ToastCloseProps<T extends ValidComponent = "button"> =
	ToastPrimitive.ToastCloseButtonProps<T> & { class?: string };

const ToastClose = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, ToastCloseProps<T>>,
) => {
	const [local, others] = splitProps(props as ToastCloseProps, ["class"]);
	return (
		<ToastPrimitive.CloseButton
			aria-label="Close"
			class={cn(
				"ui-motion absolute top-1 right-1 inline-flex size-11 items-center justify-center rounded-ui text-ink-2 transition-colors duration-[140ms] ease-out hover:bg-black/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
				local.class,
			)}
			{...others}
		>
			<CloseCircleIcon class="size-5" />
		</ToastPrimitive.CloseButton>
	);
};

function showToast(props: {
	title?: JSX.Element;
	description?: JSX.Element;
	variant?: ToastVariant;
	duration?: number;
}) {
	ToastPrimitive.toaster.show((data) => (
		<Toast
			toastId={data.toastId}
			variant={props.variant}
			duration={props.duration}
		>
			<div class="grid gap-1">
				{props.title ? <ToastTitle>{props.title}</ToastTitle> : null}
				{props.description ? (
					<ToastDescription>{props.description}</ToastDescription>
				) : null}
			</div>
			<ToastClose />
		</Toast>
	));
}

function showToastPromise<T, U>(
	promise: Promise<T> | (() => Promise<T>),
	options: {
		loading?: JSX.Element;
		success?: (data: T) => JSX.Element;
		error?: (error: U) => JSX.Element;
		duration?: number;
	},
) {
	const variant: { [key in ToastPrimitive.ToastPromiseState]: ToastVariant } = {
		pending: "default",
		fulfilled: "success",
		rejected: "error",
	};
	return ToastPrimitive.toaster.promise<T, U>(promise, (props) => (
		<Toast
			toastId={props.toastId}
			variant={variant[props.state]}
			duration={options.duration}
		>
			<Switch>
				<Match when={props.state === "pending"}>{options.loading}</Match>
				<Match when={props.state === "fulfilled"}>
					{options.success?.(props.data as T)}
				</Match>
				<Match when={props.state === "rejected"}>
					{options.error?.(props.error as U)}
				</Match>
			</Switch>
		</Toast>
	));
}

export {
	showToast,
	showToastPromise,
	Toast,
	ToastClose,
	ToastDescription,
	Toaster,
	ToastTitle,
};
export type {
	ToastCloseProps,
	ToastDescriptionProps,
	ToastRootProps,
	ToastTitleProps,
	ToastVariant,
	ToasterProps,
};

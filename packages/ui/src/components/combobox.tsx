import * as ComboboxPrimitive from "@kobalte/core/combobox";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { CheckCircleIcon } from "@solar-icons/solid/bold/check-circle";
import { RoundSortVerticalIcon } from "@solar-icons/solid/linear/round-sort-vertical";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

const Combobox = ComboboxPrimitive.Root;
const ComboboxHiddenSelect = ComboboxPrimitive.HiddenSelect;

type ComboboxControlProps<T extends ValidComponent = "div"> =
	ComboboxPrimitive.ComboboxControlProps<T> & { class?: string };

const ComboboxControl = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ComboboxControlProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxControlProps, ["class"]);
	return (
		<ComboboxPrimitive.Control
			class={cn(
				"ui-motion flex h-12 w-full items-center rounded-ui border border-rule bg-surface pr-2 pl-4 transition-[background-color,border-color,box-shadow] duration-[140ms] ease-out focus-within:outline-2 focus-within:outline-ring focus-within:outline-offset-2 disabled:opacity-50 data-[invalid]:border-coral",
				local.class,
			)}
			{...others}
		/>
	);
};

type ComboboxInputProps<T extends ValidComponent = "input"> =
	ComboboxPrimitive.ComboboxInputProps<T> & { class?: string };

const ComboboxInput = <T extends ValidComponent = "input">(
	props: PolymorphicProps<T, ComboboxInputProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxInputProps, ["class"]);
	return (
		<ComboboxPrimitive.Input
			class={cn(
				"h-full w-full bg-transparent font-medium text-base text-ink outline-none placeholder:text-ink-2/50",
				local.class,
			)}
			{...others}
		/>
	);
};

type ComboboxTriggerProps<T extends ValidComponent = "button"> =
	ComboboxPrimitive.ComboboxTriggerProps<T> & { class?: string };

const ComboboxTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, ComboboxTriggerProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxTriggerProps, ["class"]);
	return (
		<ComboboxPrimitive.Trigger
			class={cn(
				"inline-flex size-11 shrink-0 items-center justify-center rounded-ui text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
				local.class,
			)}
			{...others}
		/>
	);
};

type ComboboxIconProps<T extends ValidComponent = "span"> =
	ComboboxPrimitive.ComboboxIconProps<T> & { class?: string };

const ComboboxIcon = <T extends ValidComponent = "span">(
	props: PolymorphicProps<T, ComboboxIconProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxIconProps, ["class"]);
	return (
		<ComboboxPrimitive.Icon
			as={RoundSortVerticalIcon}
			class={cn("size-4", local.class)}
			{...others}
		/>
	);
};

type ComboboxContentProps<T extends ValidComponent = "div"> =
	ComboboxPrimitive.ComboboxContentProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const ComboboxContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ComboboxContentProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxContentProps, [
		"class",
		"children",
	]);
	return (
		<ComboboxPrimitive.Portal>
			<ComboboxPrimitive.Content
				class={cn(
					"ui-enter-zoom z-50 min-w-40 overflow-hidden rounded-ui border border-rule bg-surface p-1 shadow-pop",
					local.class,
				)}
				{...others}
			>
				{local.children ?? (
					<ComboboxPrimitive.Listbox class="m-0 max-h-72 list-none overflow-y-auto p-0" />
				)}
			</ComboboxPrimitive.Content>
		</ComboboxPrimitive.Portal>
	);
};

type ComboboxItemProps<T extends ValidComponent = "li"> =
	ComboboxPrimitive.ComboboxItemProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const ComboboxItem = <T extends ValidComponent = "li">(
	props: PolymorphicProps<T, ComboboxItemProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxItemProps, [
		"class",
		"children",
	]);
	return (
		<ComboboxPrimitive.Item
			class={cn(
				"relative flex min-h-11 w-full cursor-default select-none items-center rounded-lg py-1.5 pr-9 pl-3 font-medium text-ink text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[highlighted]:text-ink data-[disabled]:opacity-50",
				local.class,
			)}
			{...others}
		>
			{local.children}
		</ComboboxPrimitive.Item>
	);
};

type ComboboxItemLabelProps<T extends ValidComponent = "span"> =
	ComboboxPrimitive.ComboboxItemLabelProps<T> & { class?: string };

const ComboboxItemLabel = <T extends ValidComponent = "span">(
	props: PolymorphicProps<T, ComboboxItemLabelProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxItemLabelProps, [
		"class",
	]);
	return (
		<ComboboxPrimitive.ItemLabel
			class={cn("truncate", local.class)}
			{...others}
		/>
	);
};

type ComboboxItemIndicatorProps<T extends ValidComponent = "div"> =
	ComboboxPrimitive.ComboboxItemIndicatorProps<T> & { class?: string };

const ComboboxItemIndicator = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ComboboxItemIndicatorProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxItemIndicatorProps, [
		"class",
	]);
	return (
		<ComboboxPrimitive.ItemIndicator
			class={cn(
				"absolute right-3 flex size-4 items-center justify-center",
				local.class,
			)}
			{...others}
		>
			<CheckCircleIcon class="size-4" />
		</ComboboxPrimitive.ItemIndicator>
	);
};

const labelVariants = cva("font-bold text-sm leading-none", {
	variants: {
		variant: {
			label: "text-ink data-[invalid]:text-coral-ink",
			description: "font-normal text-ink-2",
			error: "text-coral-ink",
		},
	},
	defaultVariants: {
		variant: "label",
	},
});

type ComboboxLabelProps<T extends ValidComponent = "label"> =
	ComboboxPrimitive.ComboboxLabelProps<T> & { class?: string };

const ComboboxLabel = <T extends ValidComponent = "label">(
	props: PolymorphicProps<T, ComboboxLabelProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxLabelProps, ["class"]);
	return (
		<ComboboxPrimitive.Label
			class={cn(labelVariants({ variant: "label" }), local.class)}
			{...others}
		/>
	);
};

type ComboboxDescriptionProps<T extends ValidComponent = "div"> =
	ComboboxPrimitive.ComboboxDescriptionProps<T> & { class?: string };

const ComboboxDescription = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ComboboxDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxDescriptionProps, [
		"class",
	]);
	return (
		<ComboboxPrimitive.Description
			class={cn(labelVariants({ variant: "description" }), local.class)}
			{...others}
		/>
	);
};

type ComboboxErrorProps<T extends ValidComponent = "div"> =
	ComboboxPrimitive.ComboboxErrorMessageProps<T> & { class?: string };

const ComboboxError = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, ComboboxErrorProps<T>>,
) => {
	const [local, others] = splitProps(props as ComboboxErrorProps, ["class"]);
	return (
		<ComboboxPrimitive.ErrorMessage
			class={cn(labelVariants({ variant: "error" }), local.class)}
			{...others}
		/>
	);
};

export {
	Combobox,
	ComboboxContent,
	ComboboxControl,
	ComboboxDescription,
	ComboboxError,
	ComboboxHiddenSelect,
	ComboboxIcon,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIndicator,
	ComboboxItemLabel,
	ComboboxLabel,
	ComboboxTrigger,
};
export type {
	ComboboxContentProps,
	ComboboxControlProps,
	ComboboxDescriptionProps,
	ComboboxErrorProps,
	ComboboxIconProps,
	ComboboxInputProps,
	ComboboxItemIndicatorProps,
	ComboboxItemLabelProps,
	ComboboxItemProps,
	ComboboxLabelProps,
	ComboboxTriggerProps,
};

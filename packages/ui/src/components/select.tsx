import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SelectPrimitive from "@kobalte/core/select";
import { CheckCircleIcon } from "@solar-icons/solid/bold/check-circle";
import { RoundSortVerticalIcon } from "@solar-icons/solid/linear/round-sort-vertical";
import { cva } from "class-variance-authority";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;
const SelectHiddenSelect = SelectPrimitive.HiddenSelect;

type SelectTriggerProps<T extends ValidComponent = "button"> =
	SelectPrimitive.SelectTriggerProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const SelectTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, SelectTriggerProps<T>>,
) => {
	const [local, others] = splitProps(props as SelectTriggerProps, [
		"class",
		"children",
	]);
	return (
		<SelectPrimitive.Trigger
			class={cn(
				"ui-motion flex h-12 w-full items-center justify-between gap-2 rounded-ui border border-rule bg-surface px-4 font-medium text-ink text-sm transition-[background-color,border-color,box-shadow] duration-[140ms] ease-out focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-coral data-[invalid]:focus-visible:outline-coral",
				local.class,
			)}
			{...others}
		>
			{local.children}
			<SelectPrimitive.Icon
				as={RoundSortVerticalIcon}
				class="size-4 shrink-0 text-ink-2"
			/>
		</SelectPrimitive.Trigger>
	);
};

type SelectContentProps<T extends ValidComponent = "div"> =
	SelectPrimitive.SelectContentProps<T> & { class?: string };

const SelectContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, SelectContentProps<T>>,
) => {
	const [local, others] = splitProps(props as SelectContentProps, ["class"]);
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				class={cn(
					"ui-enter-zoom z-50 min-w-40 overflow-hidden rounded-ui border border-rule bg-surface p-1 shadow-pop",
					local.class,
				)}
				{...others}
			>
				<SelectPrimitive.Listbox class="m-0 max-h-72 overflow-y-auto p-0" />
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
};

type SelectItemProps<T extends ValidComponent = "li"> =
	SelectPrimitive.SelectItemProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const SelectItem = <T extends ValidComponent = "li">(
	props: PolymorphicProps<T, SelectItemProps<T>>,
) => {
	const [local, others] = splitProps(props as SelectItemProps, [
		"class",
		"children",
	]);
	return (
		<SelectPrimitive.Item
			class={cn(
				"flex min-h-11 w-full cursor-default select-none items-center rounded-lg py-1.5 pr-9 pl-3 font-medium text-ink text-sm outline-none focus:bg-surface-2 focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...others}
		>
			<SelectPrimitive.ItemLabel>{local.children}</SelectPrimitive.ItemLabel>
			<SelectPrimitive.ItemIndicator class="absolute right-3 flex size-4 items-center justify-center">
				<CheckCircleIcon class="size-4" />
			</SelectPrimitive.ItemIndicator>
		</SelectPrimitive.Item>
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

type SelectLabelProps<T extends ValidComponent = "label"> =
	SelectPrimitive.SelectLabelProps<T> & { class?: string };

const SelectLabel = <T extends ValidComponent = "label">(
	props: PolymorphicProps<T, SelectLabelProps<T>>,
) => {
	const [local, others] = splitProps(props as SelectLabelProps, ["class"]);
	return (
		<SelectPrimitive.Label
			class={cn(labelVariants({ variant: "label" }), local.class)}
			{...others}
		/>
	);
};

type SelectDescriptionProps<T extends ValidComponent = "div"> =
	SelectPrimitive.SelectDescriptionProps<T> & { class?: string };

const SelectDescription = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, SelectDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(props as SelectDescriptionProps, [
		"class",
	]);
	return (
		<SelectPrimitive.Description
			class={cn(labelVariants({ variant: "description" }), local.class)}
			{...others}
		/>
	);
};

type SelectErrorProps<T extends ValidComponent = "div"> =
	SelectPrimitive.SelectErrorMessageProps<T> & { class?: string };

const SelectError = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, SelectErrorProps<T>>,
) => {
	const [local, others] = splitProps(props as SelectErrorProps, ["class"]);
	return (
		<SelectPrimitive.ErrorMessage
			class={cn(labelVariants({ variant: "error" }), local.class)}
			{...others}
		/>
	);
};

export {
	Select,
	SelectContent,
	SelectDescription,
	SelectError,
	SelectHiddenSelect,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
};
export type {
	SelectContentProps,
	SelectDescriptionProps,
	SelectErrorProps,
	SelectItemProps,
	SelectLabelProps,
	SelectTriggerProps,
};

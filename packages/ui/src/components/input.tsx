import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TextFieldPrimitive from "@kobalte/core/text-field";
import { cva } from "class-variance-authority";
import type { ValidComponent } from "solid-js";
import { mergeProps, splitProps } from "solid-js";

import { cn } from "../lib/cn";

type InputRootProps<T extends ValidComponent = "div"> =
	TextFieldPrimitive.TextFieldRootProps<T> & { class?: string };

const InputRoot = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, InputRootProps<T>>,
) => {
	const [local, others] = splitProps(props as InputRootProps, ["class"]);
	return (
		<TextFieldPrimitive.Root
			class={cn("flex flex-col gap-1.5", local.class)}
			{...others}
		/>
	);
};

type InputProps<T extends ValidComponent = "input"> =
	TextFieldPrimitive.TextFieldInputProps<T> & {
		class?: string;
		type?:
			| "date"
			| "datetime-local"
			| "email"
			| "file"
			| "month"
			| "number"
			| "password"
			| "search"
			| "tel"
			| "text"
			| "time"
			| "url"
			| "week";
	};

/** True when a Kobalte TextField Root already exists above (e.g. <Field>). */
function hasTextFieldRoot(): boolean {
	try {
		TextFieldPrimitive.useTextFieldContext();
		return true;
	} catch {
		return false;
	}
}

const Input = <T extends ValidComponent = "input">(
	rawProps: PolymorphicProps<T, InputProps<T>>,
) => {
	const props = mergeProps<InputProps<T>[]>({ type: "text" }, rawProps);
	const [local, others] = splitProps(props as InputProps, ["type", "class"]);
	// Kobalte's control requires a TextField Root above it. <Field> already
	// provides one — nesting another Root would split the label/error/invalid
	// wiring. Self-wrap only when the control is used bare.
	const input = (
		<TextFieldPrimitive.Input
			type={local.type}
			class={cn(
				"ui-motion h-12 w-full rounded-ui border border-rule bg-surface px-4 font-medium text-base text-ink transition-[background-color,border-color,box-shadow] duration-[140ms] ease-out placeholder:text-ink-2/50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-coral data-[invalid]:bg-coral/5 data-[invalid]:focus-visible:outline-coral",
				local.class,
			)}
			{...others}
		/>
	);
	return hasTextFieldRoot() ? (
		input
	) : (
		<TextFieldPrimitive.Root class="block w-full">
			{input}
		</TextFieldPrimitive.Root>
	);
};

type TextAreaProps<T extends ValidComponent = "textarea"> =
	TextFieldPrimitive.TextFieldTextAreaProps<T> & { class?: string };

const TextArea = <T extends ValidComponent = "textarea">(
	props: PolymorphicProps<T, TextAreaProps<T>>,
) => {
	const [local, others] = splitProps(props as TextAreaProps, ["class"]);
	// Same Root requirement as Input: bare usage self-wraps, <Field> usage
	// renders the bare control inside the Field's Root.
	const textarea = (
		<TextFieldPrimitive.TextArea
			class={cn(
				"ui-motion min-h-28 w-full rounded-ui border border-rule bg-surface px-4 py-3 font-medium text-base text-ink transition-[background-color,border-color,box-shadow] duration-[140ms] ease-out placeholder:text-ink-2/50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-coral data-[invalid]:bg-coral/5 data-[invalid]:focus-visible:outline-coral",
				local.class,
			)}
			{...others}
		/>
	);
	return hasTextFieldRoot() ? (
		textarea
	) : (
		<TextFieldPrimitive.Root class="block w-full">
			{textarea}
		</TextFieldPrimitive.Root>
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

type InputLabelProps<T extends ValidComponent = "label"> =
	TextFieldPrimitive.TextFieldLabelProps<T> & { class?: string };

const InputLabel = <T extends ValidComponent = "label">(
	props: PolymorphicProps<T, InputLabelProps<T>>,
) => {
	const [local, others] = splitProps(props as InputLabelProps, ["class"]);
	return (
		<TextFieldPrimitive.Label
			class={cn(labelVariants({ variant: "label" }), local.class)}
			{...others}
		/>
	);
};

type InputDescriptionProps<T extends ValidComponent = "div"> =
	TextFieldPrimitive.TextFieldDescriptionProps<T> & { class?: string };

const InputDescription = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, InputDescriptionProps<T>>,
) => {
	const [local, others] = splitProps(props as InputDescriptionProps, ["class"]);
	return (
		<TextFieldPrimitive.Description
			class={cn(labelVariants({ variant: "description" }), local.class)}
			{...others}
		/>
	);
};

type InputErrorProps<T extends ValidComponent = "div"> =
	TextFieldPrimitive.TextFieldErrorMessageProps<T> & { class?: string };

const InputError = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, InputErrorProps<T>>,
) => {
	const [local, others] = splitProps(props as InputErrorProps, ["class"]);
	return (
		<TextFieldPrimitive.ErrorMessage
			class={cn(labelVariants({ variant: "error" }), local.class)}
			{...others}
		/>
	);
};

export { Input, InputDescription, InputError, InputLabel, InputRoot, TextArea };
export type {
	InputDescriptionProps,
	InputErrorProps,
	InputLabelProps,
	InputRootProps,
	InputProps,
	TextAreaProps,
};

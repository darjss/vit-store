import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TextFieldPrimitive from "@kobalte/core/text-field";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";
import { InputDescription, InputError, InputLabel } from "./input";

/*
 * Composed form field: label, control, description and error message wired to
 * one Kobalte text-field root. `error` flips the root to the invalid state so
 * the control and the message share one accessible description.
 *
 *   <Field label="Нэр" description="Бүтээгдэхүүний нэр" error={error()}>
 *     <Input placeholder="..." />
 *   </Field>
 */
type FieldProps<T extends ValidComponent = "div"> =
	TextFieldPrimitive.TextFieldRootProps<T> & {
		class?: string;
		children?: JSX.Element;
		label?: JSX.Element;
		description?: JSX.Element;
		error?: JSX.Element;
	};

const Field = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, FieldProps<T>>,
) => {
	const [local, others] = splitProps(props as FieldProps, [
		"class",
		"label",
		"description",
		"error",
		"children",
	]);
	return (
		<TextFieldPrimitive.Root
			class={cn("flex flex-col gap-1.5", local.class)}
			validationState={local.error ? "invalid" : "valid"}
			{...others}
		>
			{local.label ? <InputLabel>{local.label}</InputLabel> : null}
			{local.children}
			{local.description && !local.error ? (
				<InputDescription>{local.description}</InputDescription>
			) : null}
			{local.error ? <InputError>{local.error}</InputError> : null}
		</TextFieldPrimitive.Root>
	);
};

export { Field };
export type { FieldProps };

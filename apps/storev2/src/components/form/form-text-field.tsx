import { useStore } from "@tanstack/solid-form";
import type { ComponentProps } from "solid-js";
import { For } from "solid-js";
import {
	TextField,
	TextFieldErrorMessage,
	TextFieldInput,
	TextFieldLabel,
} from "../ui/text-field";
import { useFieldContext } from "./form-context";

interface FormTextFieldProps {
	label: string;
	placeholder?: string;
	type?: ComponentProps<typeof TextFieldInput>["type"];
}

export function FormTextField(props: FormTextFieldProps) {
	const field = useFieldContext<string>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const validationState = () => (errors().length > 0 ? "invalid" : "valid");

	return (
		<TextField validationState={validationState()}>
			<TextFieldLabel>{props.label}</TextFieldLabel>
			<TextFieldInput
				name={field().name}
				value={field().state.value}
				type={props.type || "text"}
				placeholder={props.placeholder || props.label}
				onBlur={field().handleBlur}
				onInput={(e) => field().handleChange(e.currentTarget.value)}
			/>
			<For each={errors()}>
				{(error) => (
					<TextFieldErrorMessage>{error.message}</TextFieldErrorMessage>
				)}
			</For>
		</TextField>
	);
}

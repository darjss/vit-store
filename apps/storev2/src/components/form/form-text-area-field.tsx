import { useStore } from "@tanstack/solid-form";
import type { ComponentProps } from "solid-js";
import { For } from "solid-js";
import {
	TextField,
	TextFieldErrorMessage,
	TextFieldLabel,
	TextFieldTextArea,
} from "../ui/text-field";
import { useFieldContext } from "./form-context";

interface FormTextAreaProps {
	label: string;
	placeholder?: string;
	type?: ComponentProps<typeof TextFieldTextArea>["type"];
}

export function FormTextArea(props: FormTextAreaProps) {
	const field = useFieldContext<string>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const validationState = () => (errors().length > 0 ? "invalid" : "valid");

	return (
		<TextField validationState={validationState()}>
			<TextFieldLabel>{props.label}</TextFieldLabel>
			<TextFieldTextArea
				name={field().name}
				value={field().state.value}
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

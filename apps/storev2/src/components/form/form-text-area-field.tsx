import { useStore } from "@tanstack/solid-form";
import type { ComponentProps } from "solid-js";
import { For, Show } from "solid-js";
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
	const isTouched = useStore(field().store, (state) => state.meta.isTouched);
	const submissionAttempts = useStore(
		field().form.store,
		(state) => state.submissionAttempts,
	);
	const showErrors = () => isTouched() || submissionAttempts() > 0;
	const validationState = () =>
		showErrors() && errors().length > 0 ? "invalid" : "valid";

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
			<Show when={showErrors()}>
				<For each={errors()}>
					{(error) => (
						<TextFieldErrorMessage>{error.message}</TextFieldErrorMessage>
					)}
				</For>
			</Show>
		</TextField>
	);
}

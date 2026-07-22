import { useStore } from "@tanstack/solid-form";
import { createMemo, Show } from "solid-js";
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
	autoComplete?: string;
}

export function FormTextArea(props: FormTextAreaProps) {
	const field = useFieldContext<string>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const isBlurred = useStore(field().store, (state) => state.meta.isBlurred);
	const submissionAttempts = useStore(
		field().form.store,
		(state) => state.submissionAttempts,
	);
	// Lazy to flag, eager to clear: errors stay hidden until the field is
	// blurred or a submit was attempted; once shown, onChange validation
	// keeps them refreshing live as the user types the correction.
	const showErrors = () => isBlurred() || submissionAttempts() > 0;
	const firstError = createMemo(() => errors()[0]?.message ?? null);
	const validationState = () =>
		showErrors() && firstError() ? "invalid" : "valid";

	return (
		<TextField validationState={validationState()}>
			<TextFieldLabel>{props.label}</TextFieldLabel>
			<TextFieldTextArea
				name={field().name}
				value={field().state.value}
				autoComplete={props.autoComplete}
				placeholder={props.placeholder || props.label}
				onBlur={field().handleBlur}
				onInput={(e) => {
					field().handleChange(e.currentTarget.value);
					if (showErrors()) {
						field().setMeta((prev) => ({
							...prev,
							errorMap: {
								...prev.errorMap,
								onBlur: undefined,
								onSubmit: undefined,
							},
						}));
					}
				}}
			/>
			<Show when={showErrors() && firstError()}>
				<TextFieldErrorMessage class="animate-error-pop">
					{firstError()}
				</TextFieldErrorMessage>
			</Show>
		</TextField>
	);
}

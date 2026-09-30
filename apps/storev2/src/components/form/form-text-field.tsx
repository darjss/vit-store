import { useStore } from "@tanstack/solid-form";
import type { ComponentProps } from "solid-js";
import { createMemo, Show } from "solid-js";
import { TextField, TextFieldErrorMessage, TextFieldInput, TextFieldLabel } from "../ui/text-field";
import { useFieldContext } from "./form-context";

interface FormTextFieldProps {
	autoComplete?: string;
	inputMode?: ComponentProps<typeof TextFieldInput>["inputmode"];
	label: string;
	placeholder?: string;
	type?: ComponentProps<typeof TextFieldInput>["type"];
}

export function FormTextField(props: FormTextFieldProps) {
	const field = useFieldContext<string>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const isBlurred = useStore(field().store, (state) => state.meta.isBlurred);
	const submissionAttempts = useStore(field().form.store, (state) => state.submissionAttempts);
	// Lazy to flag, eager to clear: errors stay hidden until the field is
	// blurred or a submit was attempted; once shown, onChange validation
	// keeps them refreshing live as the user types the correction.
	const showErrors = () => isBlurred() || submissionAttempts() > 0;
	const firstError = createMemo(() => errors()[0]?.message ?? null);
	const validationState = () => (showErrors() && firstError() ? "invalid" : "valid");

	return (
		<TextField validationState={validationState()}>
			<TextFieldLabel>{props.label}</TextFieldLabel>
			<TextFieldInput
				autoComplete={props.autoComplete}
				inputMode={props.inputMode}
				name={field().name}
				onBlur={field().handleBlur}
				onInput={(e) => {
					field().handleChange(e.currentTarget.value);
					// Clear stale errors from onBlur/onSubmit so the field
					// immediately looks valid while the user is editing.
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
				placeholder={props.placeholder || props.label}
				type={props.type || "text"}
				value={field().state.value}
			/>
			<Show when={showErrors() && firstError()}>
				<TextFieldErrorMessage class="animate-error-pop">{firstError()}</TextFieldErrorMessage>
			</Show>
		</TextField>
	);
}

import { useStore } from "@tanstack/solid-form";
import type { ComponentProps } from "solid-js";
import { createMemo, For, Show } from "solid-js";
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
	autoComplete?: string;
	inputMode?: ComponentProps<typeof TextFieldInput>["inputmode"];
}

export function FormTextField(props: FormTextFieldProps) {
	const field = useFieldContext<string>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const isTouched = useStore(field().store, (state) => state.meta.isTouched);
	const submissionAttempts = useStore(
		field().form.store,
		(state) => state.submissionAttempts,
	);
	const showErrors = () => isTouched() || submissionAttempts() > 0;
	// `meta.errors` can contain duplicates when the same field is validated by
	// both `onBlur` and `onSubmit` — dedupe by message so users see each error once.
	const uniqueErrors = createMemo(() => {
		const seen = new Set<string>();
		return errors().filter((e) => {
			const key = e.message ?? "";
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	});
	const validationState = () =>
		showErrors() && uniqueErrors().length > 0 ? "invalid" : "valid";

	return (
		<TextField validationState={validationState()}>
			<TextFieldLabel>{props.label}</TextFieldLabel>
			<TextFieldInput
				name={field().name}
				value={field().state.value}
				type={props.type || "text"}
				autoComplete={props.autoComplete}
				inputMode={props.inputMode}
				placeholder={props.placeholder || props.label}
				onBlur={field().handleBlur}
				onInput={(e) => {
					field().handleChange(e.currentTarget.value);
					// Clear stale errors from onBlur/onSubmit so the field
					// immediately looks valid while the user is editing.
					if (showErrors()) {
						field().setMeta((prev) => ({
							...prev,
							errorMap: { ...prev.errorMap, onBlur: undefined, onSubmit: undefined },
						}));
					}
				}}
			/>
			<Show when={showErrors() && uniqueErrors().length > 0}>
				<For each={uniqueErrors()}>
					{(error) => (
						<TextFieldErrorMessage>{error.message}</TextFieldErrorMessage>
					)}
				</For>
			</Show>
		</TextField>
	);
}

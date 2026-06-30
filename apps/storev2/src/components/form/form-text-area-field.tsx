import { useStore } from "@tanstack/solid-form";
import { createMemo, For, Show } from "solid-js";
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
	const isTouched = useStore(field().store, (state) => state.meta.isTouched);
	const submissionAttempts = useStore(
		field().form.store,
		(state) => state.submissionAttempts,
	);
	const showErrors = () => isTouched() || submissionAttempts() > 0 || errors().length > 0;
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

import { useStore } from "@tanstack/solid-form";
import { For, Show } from "solid-js";
import { useFieldContext } from "./form-context";

interface FormSelectOption {
	label: string;
	value: number;
}

interface FormSelectFieldProps {
	label: string;
	placeholder?: string;
	options?: FormSelectOption[];
	disabled?: boolean;
}

export function FormSelectField(props: FormSelectFieldProps) {
	const field = useFieldContext<number>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const isTouched = useStore(field().store, (state) => state.meta.isTouched);
	const submissionAttempts = useStore(
		field().form.store,
		(state) => state.submissionAttempts,
	);
	const showErrors = () => isTouched() || submissionAttempts() > 0;

	return (
		<div class="space-y-2">
			<label class="font-bold text-sm uppercase" for={field().name}>
				{props.label}
			</label>
			<select
				id={field().name}
				name={field().name}
				value={field().state.value ? String(field().state.value) : ""}
				disabled={props.disabled}
				onBlur={field().handleBlur}
				onChange={(e) => field().handleChange(Number(e.currentTarget.value) || 0)}
				class="h-12 w-full border-4 border-border bg-background px-3 font-bold text-base shadow-hard outline-none transition-all focus:translate-x-1 focus:translate-y-1 focus:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
			>
				<option value="">{props.placeholder || props.label}</option>
				<For each={props.options || []}>
					{(option) => <option value={option.value}>{option.label}</option>}
				</For>
			</select>
			<Show when={showErrors()}>
				<For each={errors()}>
					{(error) => <p class="text-destructive text-xs">{error.message}</p>}
				</For>
			</Show>
		</div>
	);
}

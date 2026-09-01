import { useStore } from "@tanstack/solid-form";
import { createMemo, For, Show } from "solid-js";
import { useFieldContext } from "./form-context";

interface FormSelectOption {
	label: string;
	value: number;
}

interface FormSelectFieldProps {
	disabled?: boolean;
	label: string;
	options?: Array<FormSelectOption>;
	placeholder?: string;
}

export function FormSelectField(props: FormSelectFieldProps) {
	const field = useFieldContext<number>();
	const errors = useStore(field().store, (state) => state.meta.errors);
	const isBlurred = useStore(field().store, (state) => state.meta.isBlurred);
	const submissionAttempts = useStore(field().form.store, (state) => state.submissionAttempts);
	// Lazy to flag, eager to clear: errors stay hidden until the field is
	// blurred or a submit was attempted; once shown, onChange validation
	// keeps them refreshing live as the user picks a correction.
	const showErrors = () => isBlurred() || submissionAttempts() > 0;
	const firstError = createMemo(() => errors()[0]?.message ?? null);
	const isInvalid = () => showErrors() && firstError() != null;

	return (
		<div class="space-y-2">
			<label
				class="data-[invalid]:text-destructive text-xs leading-none font-semibold tracking-wide"
				data-invalid={isInvalid() ? "" : undefined}
				for={field().name}
			>
				{props.label}
			</label>
			<select
				aria-invalid={isInvalid() || undefined}
				class="border-border bg-card focus-visible:ring-ring focus-visible:border-cocoa/50 h-12 w-full rounded-xl border px-4 text-base font-medium transition-[border-color,box-shadow,background-color] duration-[140ms] ease-out outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
				classList={{
					"border-destructive bg-error/60 text-destructive focus-visible:ring-destructive/40":
						isInvalid(),
				}}
				disabled={props.disabled}
				id={field().name}
				name={field().name}
				onBlur={field().handleBlur}
				onChange={(e) => {
					field().handleChange(Number(e.currentTarget.value) || 0);
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
				value={field().state.value ? String(field().state.value) : ""}
			>
				<option value="">{props.placeholder || props.label}</option>
				<For each={props.options || []}>
					{(option) => <option value={option.value}>{option.label}</option>}
				</For>
			</select>
			<Show when={isInvalid()}>
				<p class="animate-error-pop text-destructive text-xs font-bold md:text-sm">
					{firstError()}
				</p>
			</Show>
		</div>
	);
}

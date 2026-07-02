import { useStore } from "@tanstack/solid-form";
import { createMemo, For, Show } from "solid-js";
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
	const isInvalid = () => showErrors() && uniqueErrors().length > 0;

	return (
		<div class="space-y-2">
			<label
				class="font-semibold text-xs leading-none tracking-wide data-[invalid]:text-destructive"
				for={field().name}
				data-invalid={isInvalid() ? "" : undefined}
			>
				{props.label}
			</label>
			<select
				id={field().name}
				name={field().name}
				value={field().state.value ? String(field().state.value) : ""}
				aria-invalid={isInvalid() || undefined}
				disabled={props.disabled}
				onBlur={field().handleBlur}
				onChange={(e) => {
					field().handleChange(Number(e.currentTarget.value) || 0);
					if (showErrors()) {
						field().setMeta((prev) => ({
							...prev,
							errorMap: { ...prev.errorMap, onBlur: undefined, onSubmit: undefined },
						}));
					}
				}}
				class="h-12 w-full rounded-xl border border-border bg-card px-4 text-base font-medium outline-none transition-[border-color,box-shadow,background-color] duration-[140ms] ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-cocoa/50 disabled:cursor-not-allowed disabled:opacity-50"
				classList={{
					"border-destructive bg-error/60 text-destructive focus-visible:ring-destructive/40":
						isInvalid(),
				}}
			>
				<option value="">{props.placeholder || props.label}</option>
				<For each={props.options || []}>
					{(option) => <option value={option.value}>{option.label}</option>}
				</For>
			</select>
			<Show when={isInvalid()}>
				<For each={uniqueErrors()}>
					{(error) => (
						<p class="text-xs md:text-sm text-destructive font-bold">
							{error.message}
						</p>
					)}
				</For>
			</Show>
		</div>
	);
}

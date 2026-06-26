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
	const isInvalid = () => showErrors() && uniqueErrors().length > 0;

	return (
		<div class="space-y-2">
			<label
				class="font-bold text-sm uppercase data-[invalid]:text-destructive"
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
				class="h-12 w-full border-3 border-border bg-transparent px-3 font-bold text-base shadow-hard-lg outline-none transition-all focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[invalid]:border-destructive data-[invalid]:shadow-hard-lg data-[invalid]:focus-visible:ring-destructive"
				classList={{
					"border-destructive shadow-hard-lg": isInvalid(),
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
						<p class="text-xs md:text-sm text-destructive font-black uppercase">
							{error.message}
						</p>
					)}
				</For>
			</Show>
		</div>
	);
}

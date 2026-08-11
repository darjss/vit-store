// Route transition pending state (defaultPendingComponent).
export function AppLoading() {
	return (
		<output
			aria-label="Ачаалж байна"
			class="flex min-h-[50vh] items-center justify-center"
		>
			<div class="flex items-center gap-3 font-bold text-ink-2 text-sm">
				<span
					class="size-2.5 animate-pulse rounded-full bg-butter"
					aria-hidden="true"
				/>
				Ачаалж байна…
			</div>
		</output>
	);
}

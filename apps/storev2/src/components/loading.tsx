const Loading = () => {
	return (
		<div class="enter-fade flex flex-col items-center justify-center py-16 md:py-24">
			<div class="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-soft md:p-12">
				<div
					class="mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2 border-muted border-t-cocoa"
					style="animation-duration: 0.6s;"
				/>
				<h2 class="mb-4 font-display text-foreground text-lg">Уншиж байна...</h2>
				<div class="space-y-2.5">
					<div class="h-3 w-full animate-pulse rounded-full bg-muted" />
					<div class="mx-auto h-3 w-4/5 animate-pulse rounded-full bg-muted [animation-delay:120ms]" />
					<div class="mx-auto h-3 w-3/5 animate-pulse rounded-full bg-muted [animation-delay:240ms]" />
				</div>
			</div>
		</div>
	);
};
export default Loading;

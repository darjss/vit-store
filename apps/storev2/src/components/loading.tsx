const Loading = () => {
	return (
		<div class="enter-fade flex flex-col items-center justify-center py-16 md:py-24">
			<div class="border-border bg-card shadow-soft w-full max-w-md rounded-2xl border p-8 text-center md:p-12">
				<div
					class="border-muted border-t-cocoa mx-auto mb-5 h-10 w-10 animate-spin rounded-full border-2"
					style="animation-duration: 0.6s;"
				/>
				<h2 class="font-display text-foreground mb-4 text-lg">Уншиж байна...</h2>
				<div class="space-y-2.5">
					<div class="bg-muted h-3 w-full animate-pulse rounded-full" />
					<div class="bg-muted mx-auto h-3 w-4/5 animate-pulse rounded-full [animation-delay:120ms]" />
					<div class="bg-muted mx-auto h-3 w-3/5 animate-pulse rounded-full [animation-delay:240ms]" />
				</div>
			</div>
		</div>
	);
};
export default Loading;

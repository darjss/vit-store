const Loading = () => {
	return (
		<div class="flex flex-col items-center justify-center py-16 md:py-24">
			<div class="max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-soft-lg md:p-12">
				<div class="mb-6 inline-flex h-24 w-24 items-center justify-center rounded-lg border border-border bg-muted">
					<div class="h-8 w-8 animate-spin rounded-full border border-border border-t-primary" style="animation-duration: 0.8s;" />
				</div>
				<h2 class="mb-3 font-extrabold text-2xl uppercase md:text-3xl">
					Уншиж байна...
				</h2>
			</div>
		</div>
	);
};
export default Loading;

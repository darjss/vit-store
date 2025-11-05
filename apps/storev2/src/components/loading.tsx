export const Loading = () => {
	return (
		<div class="flex flex-col items-center justify-center py-16 md:py-24">
			<div class="max-w-md border-4 border-border bg-card p-8 text-center shadow-[8px_8px_0_0_#000] md:p-12">
				<div class="mb-6 inline-flex h-24 w-24 items-center justify-center border-4 border-border bg-muted">
					<div class="h-8 w-8 animate-spin border-4 border-border border-t-primary" />
				</div>
				<h2 class="mb-3 font-black text-2xl uppercase md:text-3xl">
					Уншиж байна...
				</h2>
			</div>
		</div>
	);
};
export default Loading;

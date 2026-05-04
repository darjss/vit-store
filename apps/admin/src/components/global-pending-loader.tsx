export function GlobalPendingLoader() {
	return (
		<div
			className="relative flex min-h-[min(72vh,640px)] w-full items-center justify-center overflow-hidden"
			role="status"
			aria-live="polite"
		>
			<div className="pointer-events-none absolute inset-0 opacity-[0.22] bg-grid-pattern" />
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.2]"
				style={{
					background:
						"radial-gradient(circle at center, var(--color-primary) 0%, transparent 68%)",
				}}
			/>

			<div className="relative z-10 flex flex-col items-center gap-9">
				<div className="relative">
					<div
						className="admin-pending-orbit pointer-events-none absolute -inset-8 border-2 border-dashed border-border/35"
						aria-hidden
					/>
					<div className="relative size-[5.75rem] border-2 border-border bg-card shadow-hard-sm">
						<div className="absolute inset-2.5 overflow-hidden border border-border/55 bg-background/90">
							<div className="admin-pending-shine absolute -left-1/2 -top-1/2 h-[220%] w-[220%]" />
						</div>
						<div
							className="admin-pending-corner absolute top-1.5 left-1.5 size-2 border-2 border-foreground bg-primary shadow-hard-sm"
							aria-hidden
						/>
						<div
							className="admin-pending-corner-delay absolute right-1.5 bottom-1.5 size-2 border-2 border-foreground bg-primary shadow-hard-sm"
							aria-hidden
						/>
					</div>
				</div>

				<div className="flex items-end gap-3" aria-hidden>
					{[0, 1, 2, 3].map((i) => (
						<span
							key={i}
							className="admin-pending-bar size-3 border-2 border-border bg-primary shadow-hard-sm"
							style={{ animationDelay: `${i * 110}ms` }}
						/>
					))}
				</div>
			</div>

			<span className="sr-only">Loading</span>
		</div>
	);
}

export function GlobalPendingLoader() {
	return (
		<div
			aria-live="polite"
			className="relative flex min-h-[min(72vh,640px)] w-full items-center justify-center overflow-hidden"
			role="status"
		>
			<div className="bg-grid-pattern pointer-events-none absolute inset-0 opacity-[0.22]" />
			<div
				className="pointer-events-none absolute inset-0 opacity-[0.2]"
				style={{
					background: "radial-gradient(circle at center, var(--color-primary) 0%, transparent 68%)",
				}}
			/>

			<div className="relative z-10 flex flex-col items-center gap-9">
				<div className="relative">
					<div
						aria-hidden
						className="admin-pending-orbit border-border/35 pointer-events-none absolute -inset-8 border-2 border-dashed"
					/>
					<div className="border-border bg-card shadow-hard-sm relative size-[5.75rem] border-2">
						<div className="border-border/55 bg-background/90 absolute inset-2.5 overflow-hidden border">
							<div className="admin-pending-shine absolute -top-1/2 -left-1/2 h-[220%] w-[220%]" />
						</div>
						<div
							aria-hidden
							className="admin-pending-corner border-foreground bg-primary shadow-hard-sm absolute top-1.5 left-1.5 size-2 border-2"
						/>
						<div
							aria-hidden
							className="admin-pending-corner-delay border-foreground bg-primary shadow-hard-sm absolute right-1.5 bottom-1.5 size-2 border-2"
						/>
					</div>
				</div>

				<div aria-hidden className="flex items-end gap-3">
					{[0, 1, 2, 3].map((i) => (
						<span
							className="admin-pending-bar border-border bg-primary shadow-hard-sm size-3 border-2"
							key={i}
							style={{ animationDelay: `${i * 110}ms` }}
						/>
					))}
				</div>
			</div>

			<span className="sr-only">Loading</span>
		</div>
	);
}

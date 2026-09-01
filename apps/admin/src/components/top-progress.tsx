import { useEffect, useState } from "react";

export function TopProgress({ visible }: { visible: boolean }) {
	const [shouldShow, setShouldShow] = useState(false);

	useEffect(() => {
		if (visible) {
			// Show after a brief delay to avoid flicker
			const timer = setTimeout(() => setShouldShow(true), 100);
			return () => clearTimeout(timer);
		}
		setShouldShow(false);
	}, [visible]);

	if (!shouldShow) {
		return null;
	}

	return (
		<div className="bg-background/80 fixed top-0 right-0 left-0 z-50 h-2 shadow-[0_0_18px_rgba(0,0,0,0.18)] backdrop-blur">
			<div className="bg-primary/25 h-full w-full">
				<div className="from-primary via-foreground to-primary h-full animate-[progress_1.1s_ease-in-out_infinite] bg-gradient-to-r shadow-[0_0_18px_var(--primary)]" />
			</div>
		</div>
	);
}

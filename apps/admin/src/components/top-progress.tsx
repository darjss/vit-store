import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export function TopProgress({ visible }: { visible: boolean }) {
	const [shouldShow, setShouldShow] = useState(false);

	useEffect(() => {
		if (visible) {
			// Show after a brief delay to avoid flicker
			const timer = setTimeout(() => setShouldShow(true), 100);
			return () => clearTimeout(timer);
		} else {
			setShouldShow(false);
		}
	}, [visible]);

	if (!shouldShow) return null;

	return (
		<div className="fixed top-0 left-0 right-0 z-50 h-1 bg-transparent">
			<div className="h-full w-full bg-primary/20">
				<div className="h-full animate-[progress_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary to-transparent" />
			</div>
		</div>
	);
}


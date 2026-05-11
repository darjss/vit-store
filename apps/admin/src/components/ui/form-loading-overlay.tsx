import { Loader2 } from "lucide-react";

interface FormLoadingOverlayProps {
	isLoading: boolean;
	message?: string;
}

export function FormLoadingOverlay({
	isLoading,
	message = "Хадгалж байна...",
}: FormLoadingOverlayProps) {
	if (!isLoading) return null;

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-sm">
			<div className="flex flex-col items-center gap-2">
				<Loader2 className="h-8 w-8 animate-spin text-primary" />
				<p className="font-medium text-muted-foreground text-sm">{message}</p>
			</div>
		</div>
	);
}

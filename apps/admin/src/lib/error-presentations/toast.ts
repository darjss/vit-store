import { toast } from "sonner";
import type { ErrorPresentation } from "./types";

export const showErrorPresentation = (
	presentation: ErrorPresentation,
	options?: {
		id?: string;
		action?: { label: string; onClick: () => void };
	},
) => {
	toast.error(presentation.title, {
		description: [presentation.description, presentation.reassurance]
			.filter(Boolean)
			.join(" "),
		id: options?.id,
		action: options?.action,
	});
};

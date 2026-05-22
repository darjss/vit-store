import {
	AlertCircle,
	CheckCircle2,
	Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type ExtractionStepStatus =
	| "pending"
	| "active"
	| "complete"
	| "error";

export type ExtractionStep = {
	id: string;
	label: string;
	labelMn: string;
	status: ExtractionStepStatus;
};

interface ExtractionProgressPanelProps {
	steps: ExtractionStep[];
}

export function ExtractionProgressPanel({ steps }: ExtractionProgressPanelProps) {
	return (
		<div className="space-y-3 rounded-none border-2 border-border bg-muted/30 p-4">
			<div className="flex items-center gap-2 text-sm">
				<Loader2 className="h-4 w-4 animate-spin text-primary" />
				<span className="font-bold">Ажиллаж байна...</span>
			</div>

			<div className="space-y-2">
				{steps.map((step, index) => (
					<div
						key={step.id}
						className={cn(
							"flex items-center gap-3 rounded-none border-2 p-2 transition-all",
							step.status === "active" && "border-primary bg-primary/10",
							step.status === "complete" &&
								"border-green-500 bg-green-500/10",
							step.status === "error" &&
								"border-destructive bg-destructive/10",
							step.status === "pending" &&
								"border-border bg-background opacity-50",
						)}
					>
						<div
							className={cn(
								"flex h-6 w-6 shrink-0 items-center justify-center border-2 font-bold font-heading text-xs",
								step.status === "active" &&
									"border-primary bg-primary text-primary-foreground",
								step.status === "complete" &&
									"border-green-600 bg-green-500 text-white",
								step.status === "error" &&
									"border-destructive bg-destructive text-destructive-foreground",
								step.status === "pending" &&
									"border-border bg-muted text-muted-foreground",
							)}
						>
							{step.status === "complete" ? (
								<CheckCircle2 className="h-3.5 w-3.5" />
							) : step.status === "error" ? (
								<AlertCircle className="h-3.5 w-3.5" />
							) : step.status === "active" ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								index + 1
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p
								className={cn(
									"truncate font-medium text-sm",
									step.status === "active" && "text-primary",
									step.status === "complete" && "text-green-600",
									step.status === "error" && "text-destructive",
									step.status === "pending" && "text-muted-foreground",
								)}
							>
								{step.labelMn}
							</p>
						</div>
					</div>
				))}
			</div>

			<p className="text-muted-foreground text-xs">
				Энэ процесс 15-30 секунд үргэлжилнэ. Хүлээнэ үү...
			</p>
		</div>
	);
}

export const EXTRACTION_STEPS: ExtractionStep[] = [
	{
		id: "searching",
		label: "Searching Amazon",
		labelMn: "Amazon хайж байна",
		status: "pending",
	},
	{
		id: "extracting",
		label: "Extracting data",
		labelMn: "Мэдээлэл татаж байна",
		status: "pending",
	},
	{
		id: "translating",
		label: "Translating to Mongolian",
		labelMn: "Монгол руу орчуулж байна",
		status: "pending",
	},
	{
		id: "uploading",
		label: "Uploading images",
		labelMn: "Зураг хуулж байна",
		status: "pending",
	},
];

export function resetSteps(): ExtractionStep[] {
	return EXTRACTION_STEPS.map((step) => ({ ...step, status: "pending" }));
}

export function setStepActive(
	steps: ExtractionStep[],
	stepId: string,
): ExtractionStep[] {
	return steps.map((step) => ({
		...step,
		status:
			step.id === stepId
				? "active"
				: step.status === "active"
					? "pending"
					: step.status,
	}));
}

export function markStepComplete(
	steps: ExtractionStep[],
	stepId: string,
): ExtractionStep[] {
	return steps.map((step) => ({
		...step,
		status:
			step.id === stepId
				? "complete"
				: step.status === "active"
					? "complete"
					: step.status,
	}));
}

export function markStepError(
	steps: ExtractionStep[],
	stepId: string,
): ExtractionStep[] {
	return steps.map((step) => ({
		...step,
		status: step.id === stepId ? "error" : step.status,
	}));
}

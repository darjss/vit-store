import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
	title: string;
	value: string | number;
	change?: number;
	changeType?: "increase" | "decrease";
	icon: any;
	period?: string;
}

export const StatCard = ({
	title,
	value,
	change,
	changeType,
	icon: Icon,
	period,
}: StatCardProps) => (
	<Card className="border-2 shadow-md transition-all hover:translate-y-1 hover:shadow-none">
		<CardContent className="p-4">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="font-medium text-muted-foreground text-sm">{title}</p>
					<p className="font-bold text-2xl">{value}</p>
					{change !== undefined && (
						<div className="flex items-center gap-1 text-xs">
							{changeType === "increase" ? (
								<ArrowUpRight className="h-3 w-3 text-green-600" />
							) : (
								<ArrowDownRight className="h-3 w-3 text-red-600" />
							)}
							<span
								className={
									changeType === "increase" ? "text-green-600" : "text-red-600"
								}
							>
								{Math.abs(change)}%
							</span>
							<span className="text-muted-foreground">{period}</span>
						</div>
					)}
				</div>
				<div className="rounded-lg bg-muted/50 p-2">
					<Icon className="h-5 w-5 text-muted-foreground" />
				</div>
			</div>
		</CardContent>
	</Card>
);

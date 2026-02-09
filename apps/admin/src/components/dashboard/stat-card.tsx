import { ArrowDownRight, ArrowUpRight, type LucideProps } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface StatCardProps {
	title: string;
	value: string | number;
	change?: number;
	changeType?: "increase" | "decrease";
	icon: React.ForwardRefExoticComponent<
		Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>
	>;
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
	<Card className="min-w-[200px] border-2 border-border shadow-hard transition-all active:translate-y-1 active:shadow-none">
		<CardContent className="flex flex-col justify-between p-4">
			<div className="flex items-start justify-between">
				<div>
					<p className="font-bold font-heading text-muted-foreground text-xs uppercase tracking-wider">
						{title}
					</p>
					<p className="mt-1 font-black font-heading text-2xl tracking-tight">
						{value}
					</p>
				</div>
				<div className="rounded-none border-2 border-border bg-primary/20 p-2">
					<Icon className="h-5 w-5 text-foreground" />
				</div>
			</div>

			{change !== undefined && (
				<div className="mt-4 flex items-center gap-2 border-border/10 border-t-2 pt-2 text-xs">
					<span
						className={`flex items-center gap-0.5 font-bold ${
							changeType === "increase" ? "text-green-600" : "text-destructive"
						}`}
					>
						{changeType === "increase" ? (
							<ArrowUpRight className="h-3 w-3" />
						) : (
							<ArrowDownRight className="h-3 w-3" />
						)}
						{Math.abs(change)}%
					</span>
					<span className="text-muted-foreground">{period}</span>
				</div>
			)}
		</CardContent>
	</Card>
);

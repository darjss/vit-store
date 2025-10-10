import type React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
	variant?: "default" | "text" | "avatar" | "card" | "button";
}

function Skeleton({ className, variant = "default", ...props }: SkeletonProps) {
	const baseClasses =
		"relative overflow-hidden bg-muted border-2 border-border";

	const variantClasses = {
		default: "h-4 w-full rounded-base",
		text: "h-4 w-full rounded-base shadow-sm",
		avatar: "h-12 w-12 rounded-full shadow-md",
		card: "h-32 w-full rounded-base shadow-lg",
		button: "h-10 w-24 rounded-base shadow-md",
	};

	return (
		<div
			className={cn(
				baseClasses,
				variantClasses[variant],
				"before:absolute before:inset-0 before:translate-x-[-100%] before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-background/60 before:to-transparent",
				className,
			)}
			{...props}
		/>
	);
}

// Compound components for common patterns
function SkeletonText({
	lines = 3,
	className,
}: {
	lines?: number;
	className?: string;
}) {
	return (
		<div className={cn("space-y-3", className)}>
			{Array.from({ length: lines }).map((_, i) => (
				<Skeleton
					key={i}
					variant="text"
					className={cn(
						i === lines - 1 && "w-4/5", // Last line is shorter
					)}
				/>
			))}
		</div>
	);
}

function SkeletonCard({ className }: { className?: string }) {
	return (
		<div
			className={cn(
				"rounded-base border-3 border-border bg-card p-6 shadow-lg",
				className,
			)}
		>
			<div className="flex items-start gap-4">
				<Skeleton variant="avatar" />
				<div className="flex-1 space-y-3">
					<Skeleton className="h-6 w-3/4 shadow-sm" />
					<SkeletonText lines={2} />
				</div>
			</div>
		</div>
	);
}

function SkeletonButton({ className }: { className?: string }) {
	return <Skeleton variant="button" className={cn("shadow-md", className)} />;
}

function SkeletonAvatar({
	size = "default",
	className,
}: {
	size?: "sm" | "default" | "lg";
	className?: string;
}) {
	const sizeClasses = {
		sm: "h-8 w-8 shadow-sm",
		default: "h-12 w-12 shadow-md",
		lg: "h-16 w-16 shadow-lg",
	};

	return (
		<Skeleton className={cn("rounded-full", sizeClasses[size], className)} />
	);
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonButton, SkeletonAvatar };

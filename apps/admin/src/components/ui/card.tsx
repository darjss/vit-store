import type { HTMLAttributes } from "react";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";

interface ICardProps extends HTMLAttributes<HTMLDivElement> {
	className?: string;
}

const Card = ({ className, ...props }: ICardProps) => {
	return (
		<div
			className={cn(
				"brutal-card block transition-all", // Use the class from your global CSS
				className,
			)}
			{...props}
		/>
	);
};

const CardHeader = ({ className, ...props }: ICardProps) => {
	return (
		<div
			className={cn("flex flex-col justify-start space-y-1.5 p-6", className)}
			{...props}
		/>
	);
};

const CardTitle = ({ className, ...props }: ICardProps) => {
	return (
		<Text
			as="h3"
			className={cn("font-heading font-semibold leading-none tracking-tight", className)}
			{...props}
		/>
	);
};

const CardDescription = ({ className, ...props }: ICardProps) => (
	<p className={cn("text-muted-foreground text-sm", className)} {...props} />
);

const CardContent = ({ className, ...props }: ICardProps) => {
	return <div className={cn("p-6 pt-0", className)} {...props} />;
};

const CardFooter = ({ className, ...props }: ICardProps) => {
	return (
		<div className={cn("flex items-center p-6 pt-0", className)} {...props} />
	);
};

export {
	Card,
	CardHeader,
	CardTitle,
	CardDescription,
	CardContent,
	CardFooter,
};

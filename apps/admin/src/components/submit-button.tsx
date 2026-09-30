import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "./ui/button";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	children: ReactNode;
	className?: string;
	isPending?: boolean;
	spinnerSize?: number;
	variant?: "default" | "outline" | "link" | "destructive" | null | undefined;
}

const SubmitButton = ({
	children,
	className,
	isPending,
	spinnerSize = 20,
	variant = "default",
	...props
}: SubmitButtonProps) => {
	return (
		<Button
			className={`flex gap-2 ${className}`}
			disabled={isPending}
			type="submit"
			variant={variant}
			{...props}
		>
			{isPending && <Loader2 className="animate-spin" size={spinnerSize} />}
			{children}
		</Button>
	);
};
export default SubmitButton;

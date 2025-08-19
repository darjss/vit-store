import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	isPending: boolean;
	children: ReactNode;
	className?: string;
	spinnerSize?: number;
	variant?:
		| "default"
		| "destructive"
		| "neutral"
		| "noShadow"
		| "reverse"
		| null
		| undefined;
}

const SubmitButton = ({
	isPending,
	children,
	className,
	spinnerSize = 20,
	variant = "default",
	...props
}: SubmitButtonProps) => {
	return (
		<Button
			type="submit"
			className={`flex gap-2 ${className}`}
			variant={variant}
			disabled={isPending}
			{...props}
		>
			{isPending && <Loader2 className="animate-spin" size={spinnerSize} />}
			{children}
		</Button>
	);
};
export default SubmitButton;

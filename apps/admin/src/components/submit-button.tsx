import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { IButtonProps } from "./ui/button";
import { Button } from "./ui/button";

interface SubmitButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	isPending: boolean;
	children: ReactNode;
	className?: string;
	spinnerSize?: number;
	variant?: IButtonProps["variant"];
	size?: IButtonProps["size"];
}

const SubmitButton = ({
	isPending,
	children,
	className,
	spinnerSize = 20,
	variant = "default",
	size = "md",
	...props
}: SubmitButtonProps) => {
	return (
		<Button
			type="submit"
			className={`flex gap-2 ${className}`}
			variant={variant}
			size={size}
			disabled={isPending}
			{...props}
		>
			{isPending && <Loader2 className="animate-spin" size={spinnerSize} />}
			{children}
		</Button>
	);
};
export default SubmitButton;

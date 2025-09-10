
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const tooltipContentVariants = cva(
	"fade-in-0 zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 origin-[--radix-tooltip-content-transform-origin] animate-in overflow-hidden border-2 border-border bg-background px-3 py-1.5 text-primary-foreground text-xs data-[state=closed]:animate-out",
	{
		variants: {
			variant: {
				default: "bg-background text-foreground",
				primary: "bg-primary text-primary-foreground",
				solid: "bg-black text-white",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
	React.ElementRef<typeof TooltipPrimitive.Content>,
	React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> &
	VariantProps<typeof tooltipContentVariants>
>(({ className, sideOffset = 4, variant, ...props }, ref) => (
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content
			ref={ref}
			sideOffset={sideOffset}
			className={cn(
				tooltipContentVariants({
					variant,
					className,
				}),
			)}
			{...props}
		/>
	</TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

const TooltipObject = Object.assign(Tooltip, {
	Trigger: TooltipTrigger,
	Content: TooltipContent,
	Provider: TooltipProvider,
});

export { TooltipObject as Tooltip };

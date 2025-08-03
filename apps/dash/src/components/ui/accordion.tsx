import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

import type * as React from "react";

import { cn } from "@/lib/utils";

function Accordion({
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
	return <AccordionPrimitive.Root data-slot="accordion" {...props} />;
}

function AccordionItem({
	className,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
	return (
		<AccordionPrimitive.Item
			data-slot="accordion-item"
			className={cn(
				"overflow-hidden rounded-base border-2 border-border border-b shadow-shadow",
				className,
			)}
			{...props}
		/>
	);
}

function AccordionTrigger({
	className,
	children,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
	return (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				data-slot="accordion-trigger"
				className={cn(
					"flex flex-1 items-center justify-between border-border bg-main p-4 text-left font-heading text-base text-main-foreground transition-all focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 data-[state=open]:rounded-b-none data-[state=open]:border-b-2 [&[data-state=open]>svg]:rotate-180",
					className,
				)}
				{...props}
			>
				{children}
				<ChevronDown className="pointer-events-none size-5 shrink-0 transition-transform duration-200" />
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	);
}

function AccordionContent({
	className,
	children,
	...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
	return (
		<AccordionPrimitive.Content
			data-slot="accordion-content"
			className="overflow-hidden rounded-b-base bg-secondary-background font-base text-sm transition-all data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
			{...props}
		>
			<div className={cn("p-4", className)}>{children}</div>
		</AccordionPrimitive.Content>
	);
}

AccordionContent.displayName = AccordionPrimitive.Content.displayName;

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };

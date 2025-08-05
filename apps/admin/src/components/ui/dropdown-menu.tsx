import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronRight, Circle } from "lucide-react";

import type * as React from "react";

import { cn } from "@/lib/utils";

function DropdownMenu({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
	return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
	return (
		<DropdownMenuPrimitive.Trigger
			data-slot="dropdown-menu-trigger"
			{...props}
		/>
	);
}

function DropdownMenuGroup({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
	return <DropdownMenuPrimitive.Group {...props} />;
}

function DropdownMenuPortal({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
	return <DropdownMenuPrimitive.Portal {...props} />;
}

function DropdownMenuSub({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
	return <DropdownMenuPrimitive.Sub {...props} />;
}

function DropdownMenuRadioGroup({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
	return <DropdownMenuPrimitive.RadioGroup {...props} />;
}

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.SubTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"flex cursor-default select-none items-center gap-2 rounded-base border-2 border-transparent bg-main px-2 py-1.5 font-base text-sm outline-hidden focus:border-border data-[inset=true]:pl-8 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<ChevronRight className="ml-auto" />
		</DropdownMenuPrimitive.SubTrigger>
	);
}

function DropdownMenuSubContent({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
	return (
		<DropdownMenuPrimitive.SubContent
			className={cn(
				"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-base border-2 border-border bg-main p-1 font-base text-main-foreground data-[state=closed]:animate-out data-[state=open]:animate-in",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuContent({
	className,
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Content
				data-slot="dropdown-menu-content"
				sideOffset={sideOffset}
				className={cn(
					"data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-base border-2 border-border bg-main p-1 font-base text-main-foreground data-[state=closed]:animate-out data-[state=open]:animate-in",
					className,
				)}
				{...props}
			/>
		</DropdownMenuPrimitive.Portal>
	);
}

function DropdownMenuItem({
	className,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			className={cn(
				"relative flex cursor-default select-none items-center gap-2 rounded-base border-2 border-transparent bg-main px-2 py-1.5 font-base text-sm outline-hidden transition-colors focus:border-border data-disabled:pointer-events-none data-[inset=true]:pl-8 data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
	return (
		<DropdownMenuPrimitive.CheckboxItem
			className={cn(
				"relative flex cursor-default select-none items-center gap-2 rounded-base border-2 border-transparent py-1.5 pr-2 pl-8 font-base text-main-foreground text-sm outline-hidden transition-colors focus:border-border data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			checked={checked}
			{...props}
		>
			<span className="absolute left-2 flex size-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Check />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.CheckboxItem>
	);
}

function DropdownMenuRadioItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
	return (
		<DropdownMenuPrimitive.RadioItem
			className={cn(
				"relative flex cursor-default select-none items-center gap-2 rounded-base border-2 border-transparent py-1.5 pr-2 pl-8 font-base text-sm outline-hidden transition-colors focus:border-border data-disabled:pointer-events-none data-disabled:opacity-50",
				className,
			)}
			{...props}
		>
			<span className="absolute left-2 flex size-3.5 items-center justify-center">
				<DropdownMenuPrimitive.ItemIndicator>
					<Circle className="size-2 fill-current" />
				</DropdownMenuPrimitive.ItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.RadioItem>
	);
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.Label
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn(
				"px-2 py-1.5 font-heading text-sm data-[inset]:pl-8",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
	return (
		<DropdownMenuPrimitive.Separator
			className={cn("-mx-1 my-1 h-0.5 bg-border", className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({
	className,
	...props
}: React.HTMLAttributes<HTMLSpanElement>) {
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn("ml-auto font-base text-xs tracking-widest", className)}
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuGroup,
	DropdownMenuPortal,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuRadioGroup,
};

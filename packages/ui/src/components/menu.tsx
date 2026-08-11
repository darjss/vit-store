import * as MenuPrimitive from "@kobalte/core/dropdown-menu";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import { CheckCircleIcon } from "@solar-icons/solid/bold/check-circle";
import { RecordIcon } from "@solar-icons/solid/bold/record";
import { AltArrowRightIcon } from "@solar-icons/solid/linear/alt-arrow-right";
import type { Component, JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

const MenuTrigger = MenuPrimitive.Trigger;
const MenuPortal = MenuPrimitive.Portal;
const MenuSub = MenuPrimitive.Sub;
const MenuGroup = MenuPrimitive.Group;
const MenuRadioGroup = MenuPrimitive.RadioGroup;

const Menu: Component<MenuPrimitive.DropdownMenuRootProps> = (props) => {
	return <MenuPrimitive.Root gutter={4} {...props} />;
};

type MenuContentProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuContentProps<T> & { class?: string };

const MenuContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuContentProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuContentProps, ["class"]);
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Content
				class={cn(
					"ui-enter-zoom z-50 min-w-56 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-ui border border-rule bg-surface p-1 shadow-pop",
					local.class,
				)}
				{...others}
			/>
		</MenuPrimitive.Portal>
	);
};

type MenuItemProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuItemProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const MenuItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuItemProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuItemProps, [
		"class",
		"children",
	]);
	return (
		<MenuPrimitive.Item
			class={cn(
				"relative flex min-h-11 cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 font-semibold text-ink text-sm outline-none transition-colors duration-[140ms] ease-out focus:bg-surface-2 focus:text-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...others}
		>
			{local.children}
		</MenuPrimitive.Item>
	);
};

type MenuItemLabelProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuItemLabelProps<T> & { class?: string };

const MenuItemLabel = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuItemLabelProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuItemLabelProps, ["class"]);
	return (
		<MenuPrimitive.ItemLabel class={cn("truncate", local.class)} {...others} />
	);
};

type MenuShortcutProps = {
	class?: string;
	children?: JSX.Element;
};

const MenuShortcut = (props: MenuShortcutProps) => {
	const [local, others] = splitProps(props, ["class", "children"]);
	return (
		<span
			class={cn("ml-auto text-ink-2 text-xs tracking-widest", local.class)}
			{...others}
		>
			{local.children}
		</span>
	);
};

type MenuLabelProps = {
	class?: string;
	inset?: boolean;
	children?: JSX.Element;
};

const MenuLabel = (props: MenuLabelProps) => {
	const [local, others] = splitProps(props, ["class", "inset", "children"]);
	return (
		<div
			class={cn(
				"truncate px-3 py-2 font-bold text-ink-2 text-xs uppercase tracking-wide",
				local.inset && "pl-8",
				local.class,
			)}
			{...others}
		>
			{local.children}
		</div>
	);
};

type MenuSeparatorProps<T extends ValidComponent = "hr"> =
	MenuPrimitive.DropdownMenuSeparatorProps<T> & { class?: string };

const MenuSeparator = <T extends ValidComponent = "hr">(
	props: PolymorphicProps<T, MenuSeparatorProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuSeparatorProps, ["class"]);
	return (
		<MenuPrimitive.Separator
			class={cn("-mx-1 my-1 h-px bg-rule", local.class)}
			{...others}
		/>
	);
};

type MenuSubTriggerProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuSubTriggerProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const MenuSubTrigger = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuSubTriggerProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuSubTriggerProps, [
		"class",
		"children",
	]);
	return (
		<MenuPrimitive.SubTrigger
			class={cn(
				"flex min-h-11 cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 font-semibold text-ink text-sm outline-none focus:bg-surface-2 data-[expanded]:bg-surface-2",
				local.class,
			)}
			{...others}
		>
			{local.children}
			<AltArrowRightIcon class="ml-auto size-4 shrink-0 text-ink-2" />
		</MenuPrimitive.SubTrigger>
	);
};

type MenuSubContentProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuSubContentProps<T> & { class?: string };

const MenuSubContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuSubContentProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuSubContentProps, ["class"]);
	return (
		<MenuPrimitive.SubContent
			class={cn(
				"ui-enter-zoom z-50 min-w-32 origin-[var(--kb-menu-content-transform-origin)] overflow-hidden rounded-ui border border-rule bg-surface p-1 shadow-pop",
				local.class,
			)}
			{...others}
		/>
	);
};

type MenuCheckboxItemProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuCheckboxItemProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const MenuCheckboxItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuCheckboxItemProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuCheckboxItemProps, [
		"class",
		"children",
	]);
	return (
		<MenuPrimitive.CheckboxItem
			class={cn(
				"relative flex min-h-11 cursor-default select-none items-center gap-2 rounded-lg py-2 pr-3 pl-9 font-semibold text-ink text-sm outline-none transition-colors duration-[140ms] ease-out focus:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...others}
		>
			<span class="absolute left-3 flex size-4 items-center justify-center">
				<MenuPrimitive.ItemIndicator>
					<CheckCircleIcon class="size-4" />
				</MenuPrimitive.ItemIndicator>
			</span>
			{local.children}
		</MenuPrimitive.CheckboxItem>
	);
};

type MenuRadioItemProps<T extends ValidComponent = "div"> =
	MenuPrimitive.DropdownMenuRadioItemProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const MenuRadioItem = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, MenuRadioItemProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuRadioItemProps, [
		"class",
		"children",
	]);
	return (
		<MenuPrimitive.RadioItem
			class={cn(
				"relative flex min-h-11 cursor-default select-none items-center gap-2 rounded-lg py-2 pr-3 pl-9 font-semibold text-ink text-sm outline-none transition-colors duration-[140ms] ease-out focus:bg-surface-2 data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
				local.class,
			)}
			{...others}
		>
			<span class="absolute left-3 flex size-4 items-center justify-center">
				<MenuPrimitive.ItemIndicator>
					<RecordIcon class="size-2 fill-current" />
				</MenuPrimitive.ItemIndicator>
			</span>
			{local.children}
		</MenuPrimitive.RadioItem>
	);
};

type MenuGroupLabelProps<T extends ValidComponent = "span"> =
	MenuPrimitive.DropdownMenuGroupLabelProps<T> & { class?: string };

const MenuGroupLabel = <T extends ValidComponent = "span">(
	props: PolymorphicProps<T, MenuGroupLabelProps<T>>,
) => {
	const [local, others] = splitProps(props as MenuGroupLabelProps, ["class"]);
	return (
		<MenuPrimitive.GroupLabel
			class={cn("px-3 py-2 font-bold text-ink-2 text-xs", local.class)}
			{...others}
		/>
	);
};

export {
	Menu,
	MenuCheckboxItem,
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuItemLabel,
	MenuLabel,
	MenuPortal,
	MenuRadioGroup,
	MenuRadioItem,
	MenuSeparator,
	MenuShortcut,
	MenuSub,
	MenuSubContent,
	MenuSubTrigger,
	MenuTrigger,
};
export type {
	MenuCheckboxItemProps,
	MenuContentProps,
	MenuGroupLabelProps,
	MenuItemLabelProps,
	MenuItemProps,
	MenuRadioItemProps,
	MenuSeparatorProps,
	MenuSubContentProps,
	MenuSubTriggerProps,
};

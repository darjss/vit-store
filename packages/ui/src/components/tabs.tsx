import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as TabsPrimitive from "@kobalte/core/tabs";
import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

const Tabs = TabsPrimitive.Root;

type TabsListProps<T extends ValidComponent = "div"> =
	TabsPrimitive.TabsListProps<T> & { class?: string };

const TabsList = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, TabsListProps<T>>,
) => {
	const [local, others] = splitProps(props as TabsListProps, ["class"]);
	return (
		<TabsPrimitive.List
			class={cn(
				"flex items-center gap-1 overflow-x-auto rounded-ui bg-surface-2 p-1",
				local.class,
			)}
			{...others}
		/>
	);
};

type TabsTriggerProps<T extends ValidComponent = "button"> =
	TabsPrimitive.TabsTriggerProps<T> & {
		class?: string;
		children?: JSX.Element;
	};

const TabsTrigger = <T extends ValidComponent = "button">(
	props: PolymorphicProps<T, TabsTriggerProps<T>>,
) => {
	const [local, others] = splitProps(props as TabsTriggerProps, [
		"class",
		"children",
	]);
	return (
		<TabsPrimitive.Trigger
			class={cn(
				"inline-flex min-h-11 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 font-bold text-ink-2 text-sm transition-colors duration-[140ms] ease-out hover:text-ink focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 data-[selected]:bg-surface data-[selected]:text-ink data-[disabled]:opacity-50 data-[selected]:shadow-card",
				local.class,
			)}
			{...others}
		>
			{local.children}
		</TabsPrimitive.Trigger>
	);
};

type TabsContentProps<T extends ValidComponent = "div"> =
	TabsPrimitive.TabsContentProps<T> & { class?: string };

const TabsContent = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, TabsContentProps<T>>,
) => {
	const [local, others] = splitProps(props as TabsContentProps, ["class"]);
	return (
		<TabsPrimitive.Content
			class={cn(
				"focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
				local.class,
			)}
			{...others}
		/>
	);
};

export { Tabs, TabsContent, TabsList, TabsTrigger };
export type { TabsContentProps, TabsListProps, TabsTriggerProps };

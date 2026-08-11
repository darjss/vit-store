import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import * as SkeletonPrimitive from "@kobalte/core/skeleton";
import type { ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import { cn } from "../lib/cn";

type SkeletonProps<T extends ValidComponent = "div"> =
	SkeletonPrimitive.SkeletonRootProps<T> & { class?: string };

const Skeleton = <T extends ValidComponent = "div">(
	props: PolymorphicProps<T, SkeletonProps<T>>,
) => {
	const [local, others] = splitProps(props as SkeletonProps, ["class"]);
	return (
		<SkeletonPrimitive.Root
			class={cn(
				"ui-motion rounded-ui bg-gray/60 data-[animate=true]:animate-pulse",
				local.class,
			)}
			{...others}
		/>
	);
};

export { Skeleton };
export type { SkeletonProps };

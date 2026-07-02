import { Image } from "@unpic/solid";
import { createSignal, For, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { getProductImageProps } from "@/lib/image";
import { WASH_BG, type Wash, washFor } from "@/lib/wash";
import { cn } from "@/lib/utils";
import ProductImageFallback from "./product-image-fallback";

interface ProductImage {
	url: string;
	isPrimary: boolean;
}

interface Props {
	images: ProductImage[];
	productName: string;
	productId: number;
	washKey?: string | number;
}

export default function ProductImageCarousel(props: Props) {
	const sortedImages = () => {
		const imgs = [...props.images];
		return imgs.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
	};

	const wash = (): Wash => washFor(props.washKey ?? props.productId);
	const washClass = () => WASH_BG[wash()];

	const [selectedIndex, setSelectedIndex] = createSignal(0);

	const handleThumbnailClick = (index: number) => {
		setSelectedIndex(index);
	};

	const images = sortedImages();
	const hasMultipleImages = images.length > 1;
	const selectedImageProps = () =>
		getProductImageProps(images[selectedIndex()]?.url, "hero");

	// Swipe detection (pointer events: works for touch + mouse).
	// touch-action: pan-y keeps vertical page scroll; we only claim horizontal swipes.
	const SWIPE_THRESHOLD = 50;
	let pointerStart: { x: number; y: number } | null = null;

	const handlePointerDown = (e: PointerEvent) => {
		pointerStart = { x: e.clientX, y: e.clientY };
	};

	const handlePointerUp = (e: PointerEvent) => {
		const start = pointerStart;
		pointerStart = null;
		if (!start || images.length <= 1) return;
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		// Ignore if mostly vertical (let page scroll handle it) or too small.
		if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
		setSelectedIndex((prev) => {
			const next = dx < 0 ? prev + 1 : prev - 1;
			return (next + images.length) % images.length;
		});
	};

	return (
		<div class="w-full space-y-4">
			<div
				class={cn(
					"relative aspect-square w-full overflow-hidden rounded-2xl shadow-soft sm:shadow-soft-lg",
					washClass(),
				)}
				style={{ "touch-action": "pan-y" }}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
			>
				<div class="absolute inset-0 bg-dots-subtle" />

				<Show
					when={images[selectedIndex()]}
					keyed
					fallback={
						<ProductImageFallback
							name={props.productName}
							class="relative z-10"
						/>
					}
				>
					{(image) => (
						<Motion.div
							class="relative z-10 h-full w-full"
							initial={{
								opacity: 0,
								scale: 0.96,
								filter: "blur(2px)",
							}}
							animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
							transition={{ duration: 0.3, easing: [0.23, 1, 0.32, 1] }}
						>
							<Image
								src={selectedImageProps().src || image.url}
								alt={props.productName}
								width={selectedImageProps().width}
								height={selectedImageProps().height}
								sizes={selectedImageProps().sizes}
								layout="constrained"
								objectFit="contain"
								priority={true}
								class="h-full w-full p-8 sm:p-12"
							/>
						</Motion.div>
					)}
				</Show>
			</div>

			{/* Soft dot indicators - mobile-first navigation */}
			<Show when={hasMultipleImages}>
				<div class="flex justify-center gap-1 sm:hidden">
					<For each={images}>
						{(_, index) => (
							<button
								type="button"
								onClick={() => handleThumbnailClick(index())}
								class="flex h-8 w-8 items-center justify-center"
								aria-label={`${props.productName} зураг ${index() + 1}`}
								aria-current={selectedIndex() === index()}
							>
								<span
									class={cn(
										"block size-2 rounded-full transition-[background-color,transform] duration-200 ease-out",
										selectedIndex() === index()
											? "scale-110 bg-cocoa/70"
											: "bg-cocoa/20",
									)}
								/>
							</button>
						)}
					</For>
				</div>
			</Show>

			{/* Thumbnail navigation - larger screens */}
			<Show when={hasMultipleImages}>
				<div class="scrollbar-hide hidden gap-3 overflow-x-auto pb-2 sm:flex sm:justify-center sm:gap-4">
					<For each={images}>
						{(image, index) => {
							const imageProps = getProductImageProps(image.url, "thumb");
							return (
								<button
									type="button"
									onClick={() => handleThumbnailClick(index())}
									class={cn(
										"relative aspect-square w-16 shrink-0 overflow-hidden rounded-xl transition-[opacity,transform,box-shadow] duration-200 ease-out-quart sm:w-20 md:w-24",
										washClass(),
										selectedIndex() === index()
											? "shadow-soft ring-2 ring-cocoa/40 ring-offset-2 ring-offset-background"
											: "opacity-60 hover:opacity-100 hover:shadow-soft-sm",
									)}
								>
									<div class="absolute inset-0 bg-dots-subtle" />
									<Image
										src={imageProps.src || image.url}
										alt={`${props.productName} харагдац ${index() + 1}`}
										width={imageProps.width}
										height={imageProps.height}
										sizes={imageProps.sizes}
										layout="constrained"
										objectFit="contain"
										class="relative z-10 h-full w-full p-2 sm:p-3"
										decoding="async"
									/>
								</button>
							);
						}}
					</For>
				</div>
			</Show>
		</div>
	);
}

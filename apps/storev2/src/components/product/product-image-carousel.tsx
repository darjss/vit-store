import { Image } from "@unpic/solid";
import { createSignal, For, Show } from "solid-js";
import { Motion } from "solid-motionone";
import { getProductImageProps } from "@/lib/image";
import { cn } from "@/lib/utils";
import { WASH_BG, type Wash, washFor } from "@/lib/wash";
import ProductImageFallback from "./product-image-fallback";

interface ProductImage {
	isPrimary: boolean;
	url: string;
}

interface Props {
	images: Array<ProductImage>;
	productId: number;
	productName: string;
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
	const [heroImageFailed, setHeroImageFailed] = createSignal(false);

	const handleThumbnailClick = (index: number) => {
		setSelectedIndex(index);
		setHeroImageFailed(false);
	};

	const images = sortedImages();
	const hasMultipleImages = images.length > 1;
	const selectedImageProps = () => getProductImageProps(images[selectedIndex()]?.url, "hero");

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
		if (!start || images.length <= 1) {
			return;
		}
		const dx = e.clientX - start.x;
		const dy = e.clientY - start.y;
		// Ignore if mostly vertical (let page scroll handle it) or too small.
		if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) {
			return;
		}
		setSelectedIndex((prev) => {
			const next = dx < 0 ? prev + 1 : prev - 1;
			return (next + images.length) % images.length;
		});
		setHeroImageFailed(false);
	};

	return (
		<div class="w-full space-y-4">
			<div
				class={cn(
					"shadow-soft sm:shadow-soft-lg relative aspect-square w-full overflow-hidden rounded-2xl",
					washClass(),
				)}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
				style={{ "touch-action": "pan-y" }}
			>
				<div class="bg-dots-subtle absolute inset-0" />

				<Show
					fallback={<ProductImageFallback class="relative z-10" name={props.productName} />}
					keyed
					when={!heroImageFailed() && images[selectedIndex()]}
				>
					{(image) => (
						<Motion.div
							animate={{ filter: "blur(0px)", opacity: 1, scale: 1 }}
							class="relative z-10 h-full w-full"
							initial={{
								filter: "blur(2px)",
								opacity: 0,
								scale: 0.96,
							}}
							transition={{ duration: 0.3, easing: [0.23, 1, 0.32, 1] }}
						>
							<Image
								alt={props.productName}
								class="h-full w-full p-8 sm:p-12"
								height={selectedImageProps().height}
								layout="constrained"
								objectFit="contain"
								onError={() => setHeroImageFailed(true)}
								priority={true}
								sizes={selectedImageProps().sizes}
								src={selectedImageProps().src || image.url}
								width={selectedImageProps().width}
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
								aria-current={selectedIndex() === index()}
								aria-label={`${props.productName} зураг ${index() + 1}`}
								class="focus-visible:ring-ring flex size-11 items-center justify-center rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
								onClick={() => handleThumbnailClick(index())}
								type="button"
							>
								<span
									class={cn(
										"block size-2 rounded-full transition-[background-color,transform] duration-200 ease-out",
										selectedIndex() === index() ? "bg-cocoa/70 scale-110" : "bg-cocoa/20",
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
							const [thumbFailed, setThumbFailed] = createSignal(false);
							return (
								<button
									class={cn(
										"ease-out-quart relative aspect-square w-16 shrink-0 overflow-hidden rounded-xl transition-[opacity,transform,box-shadow] duration-200 sm:w-20 md:w-24",
										washClass(),
										selectedIndex() === index()
											? "shadow-soft ring-cocoa/40 ring-offset-background ring-2 ring-offset-2"
											: "hover:shadow-soft-sm opacity-60 hover:opacity-100",
									)}
									onClick={() => handleThumbnailClick(index())}
									type="button"
								>
									<div class="bg-dots-subtle absolute inset-0" />
									<Show when={!thumbFailed()}>
										<Image
											alt={`${props.productName} харагдац ${index() + 1}`}
											class="relative z-10 h-full w-full p-2 sm:p-3"
											decoding="async"
											height={imageProps.height}
											layout="constrained"
											objectFit="contain"
											onError={() => setThumbFailed(true)}
											sizes={imageProps.sizes}
											src={imageProps.src || image.url}
											width={imageProps.width}
										/>
									</Show>
								</button>
							);
						}}
					</For>
				</div>
			</Show>
		</div>
	);
}

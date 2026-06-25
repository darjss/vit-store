import { Image } from "@unpic/solid";
import { productColors } from "@vit/shared";
import { createSignal, For, Show } from "solid-js";
import { getProductImageProps } from "@/lib/image";
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
}

export default function ProductImageCarousel(props: Props) {
	const sortedImages = () => {
		const imgs = [...props.images];
		return imgs.sort((a, b) => (b.isPrimary ? 1 : 0) - (a.isPrimary ? 1 : 0));
	};

	const imageColors = () => {
		return sortedImages().map(
			(_, index) => productColors[(props.productId + index) % productColors.length],
		);
	};

	const [selectedIndex, setSelectedIndex] = createSignal(0);
	const colors = imageColors();

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
		<div class="w-full space-y-6">
			<div
				class="relative aspect-square w-full overflow-hidden border-2 border-border shadow-hard transition-all duration-300 sm:shadow-hard-lg"
				style={{
					background: colors[selectedIndex()],
					"touch-action": "pan-y",
				}}
				onPointerDown={handlePointerDown}
				onPointerUp={handlePointerUp}
			>
				<div class="absolute inset-0 bg-dots-pattern opacity-20" />

				<Show
					when={images[selectedIndex()]}
					fallback={
						<ProductImageFallback
							name={props.productName}
							class="relative z-10"
						/>
					}
				>
					<Image
						src={selectedImageProps().src || images[selectedIndex()].url}
						alt={props.productName}
						width={selectedImageProps().width}
						height={selectedImageProps().height}
						sizes={selectedImageProps().sizes}
						layout="constrained"
						objectFit="contain"
						priority={true}
						class="relative z-10 h-full w-full p-8 transition-transform duration-500 hover:scale-105 sm:p-12"
					/>
				</Show>
			</div>

			{/* Thumbnail Navigation - Centered */}
			<Show when={hasMultipleImages}>
				<div class="scrollbar-hide flex justify-center gap-3 overflow-x-auto pb-4 sm:gap-4">
					<For each={images}>
						{(image, index) => {
							const imageProps = getProductImageProps(image.url, "thumb");
							return (
								<button
									type="button"
									onClick={() => handleThumbnailClick(index())}
									class={cn(
										"relative aspect-square w-16 shrink-0 overflow-hidden border-2 border-border transition-all sm:w-20 md:w-24",
										selectedIndex() === index()
											? "scale-105 shadow-hard ring-2 ring-primary ring-offset-2"
											: "opacity-60 shadow-sm hover:scale-105 hover:opacity-100 hover:shadow-hard-sm",
									)}
									style={{ background: colors[index()] }}
								>
									<div class="absolute inset-0 bg-dots-pattern opacity-20" />
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
									<Show when={selectedIndex() === index()}>
										<div class="absolute inset-0 border-2 border-primary bg-primary/10" />
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

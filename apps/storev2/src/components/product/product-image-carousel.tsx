import { Image } from "@unpic/solid";
import { createSignal, For, Show } from "solid-js";
import { productColors } from "@/lib/constant";
import { cn } from "@/lib/utils";

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
			() => productColors[Math.floor(Math.random() * productColors.length)],
		);
	};

	const [selectedIndex, setSelectedIndex] = createSignal(0);
	const colors = imageColors();

	const handleThumbnailClick = (index: number) => {
		setSelectedIndex(index);
	};

	const images = sortedImages();
	const hasMultipleImages = images.length > 1;

	return (
		<div class="w-full space-y-4">
			<div
				class="relative aspect-square w-full overflow-hidden rounded-sm border-4 border-black shadow-[6px_6px_0_0_#000] sm:border-6 sm:shadow-[12px_12px_0_0_#000]"
				style={{ background: colors[selectedIndex()] }}
			>
				<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-[size:14px_14px]" />

				<Show
					when={images[selectedIndex()]}
					fallback={
						<div class="flex h-full items-center justify-center text-6xl">
							💊
						</div>
					}
				>
					<Image
						src={images[selectedIndex()].url}
						alt={props.productName}
						width={800}
						height={800}
						layout="constrained"
						priority={true}
						class="relative z-10 h-full w-full object-contain p-8 sm:p-12"
					/>
				</Show>
			</div>

			{/* Thumbnail Navigation - Centered */}
			<Show when={hasMultipleImages}>
				<div class="scrollbar-hide flex justify-center gap-2 overflow-x-auto pb-2 sm:gap-3">
					<For each={images}>
						{(image, index) => (
							<button
								type="button"
								onClick={() => handleThumbnailClick(index())}
								class={cn(
									"relative aspect-square w-16 shrink-0 overflow-hidden rounded-sm border-3 border-black transition-all sm:w-20 md:w-24",
									selectedIndex() === index()
										? "scale-105 shadow-[4px_4px_0_0_#000] sm:shadow-[6px_6px_0_0_#000]"
										: "opacity-60 shadow-[2px_2px_0_0_#000] hover:scale-105 hover:opacity-100 sm:shadow-[3px_3px_0_0_#000]",
								)}
								style={{ background: colors[index()] }}
							>
								<div class="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,0,0,0.07)_2px,transparent_0)] bg-[size:14px_14px]" />
								<Image
									src={image.url}
									alt={`${props.productName} харагдац ${index() + 1}`}
									width={96}
									height={96}
									layout="constrained"
									class="relative z-10 h-full w-full object-contain p-2 sm:p-3"
								/>
								<Show when={selectedIndex() === index()}>
									<div class="absolute inset-0 border-2 border-black bg-black/10" />
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

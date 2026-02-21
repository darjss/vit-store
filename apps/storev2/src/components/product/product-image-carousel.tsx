import { Image } from "@unpic/solid";
import { productColors } from "@vit/shared";
import { createSignal, For, Show } from "solid-js";
import { toProductImageUrl } from "@/lib/image";
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
		<div class="w-full space-y-6">
			<div
				class="relative aspect-square w-full overflow-hidden border-2 border-border shadow-hard transition-all duration-300 sm:shadow-hard-lg"
				style={{ background: colors[selectedIndex()] }}
			>
				<div class="absolute inset-0 bg-dots-pattern opacity-20" />

				<Show
					when={images[selectedIndex()]}
					fallback={
						<div class="flex h-full items-center justify-center text-6xl opacity-20">
							💊
						</div>
					}
				>
					<Image
						src={
							toProductImageUrl(images[selectedIndex()].url, "md") ||
							images[selectedIndex()].url
						}
						alt={props.productName}
						width={800}
						height={800}
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
						{(image, index) => (
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
									src={toProductImageUrl(image.url, "sm") || image.url}
									alt={`${props.productName} харагдац ${index() + 1}`}
									width={96}
									height={96}
									layout="constrained"
									objectFit="contain"
									class="relative z-10 h-full w-full p-2 sm:p-3"
								/>
								<Show when={selectedIndex() === index()}>
									<div class="absolute inset-0 border-2 border-primary bg-primary/10" />
								</Show>
							</button>
						)}
					</For>
				</div>
			</Show>
		</div>
	);
}

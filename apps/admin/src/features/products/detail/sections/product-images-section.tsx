import { Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { UploadButton } from "@/components/upload-button";
import type { RouterOutputs } from "@/lib/types";
import { cn } from "@/lib/utils";

type Product = RouterOutputs["product"]["getProductById"];

type ProductDetailImagesSectionProps = {
	addImage: (input: { productId: number; url: string }) => void;
	deleteImage: (input: { id: number }) => void;
	featuredImageIndex: number;
	isDeleteImagePending: boolean;
	isRegenerateProductImagesPending: boolean;
	isSetPrimaryImagePending: boolean;
	onFeaturedImageChange: (index: number) => void;
	product: Product;
	productId: number;
	regenerateProductImages: (input: { productId: number }) => void;
	setPrimaryImage: (input: { imageId: number; productId: number }) => void;
};

// The picked image shows large in the summary above. Actions sit under the grid instead of on hover, so they work on a phone.
export function ProductDetailImagesSection({
	addImage,
	deleteImage,
	featuredImageIndex,
	isDeleteImagePending,
	isRegenerateProductImagesPending,
	isSetPrimaryImagePending,
	onFeaturedImageChange,
	product,
	productId,
	regenerateProductImages,
	setPrimaryImage,
}: ProductDetailImagesSectionProps) {
	const picked = product.images[featuredImageIndex];

	return (
		<section className="border bg-white">
			<div className="flex items-center gap-2 border-b py-1.5 pr-2 pl-4">
				<h2 className="text-muted-foreground flex-1 text-xs font-medium tracking-wide uppercase">
					Зураг · {product.images.length}
				</h2>
				<button
					className="flex h-9 items-center gap-1.5 border bg-white px-3 text-sm"
					disabled={isRegenerateProductImagesPending}
					onClick={() => regenerateProductImages({ productId })}
					type="button"
				>
					{isRegenerateProductImagesPending ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<Sparkles className="size-4" />
					)}
					AI
				</button>
				<UploadButton category="product" onSuccess={(url) => addImage({ productId, url })} />
			</div>

			{product.images.length > 0 ? (
				<>
					<div className="grid grid-cols-4 gap-2 p-3 sm:grid-cols-6">
						{product.images.map((image, index) => (
							<button
								className={cn(
									"relative aspect-square border bg-white p-1",
									index === featuredImageIndex && "outline-foreground outline-2 -outline-offset-1",
								)}
								key={image.id}
								onClick={() => onFeaturedImageChange(index)}
								type="button"
							>
								<img alt="" className="h-full w-full object-contain" src={image.url} />
								{image.isPrimary && (
									<Star className="fill-primary text-foreground absolute top-1 right-1 size-3.5" />
								)}
							</button>
						))}
					</div>
					{picked ? (
						<div className="flex items-center gap-2 border-t px-3 py-2">
							<p className="text-muted-foreground flex-1 text-xs">
								{picked.isPrimary ? "Үндсэн зураг" : "Сонгосон зураг"}
							</p>
							{!picked.isPrimary && (
								<button
									className="flex h-9 items-center gap-1.5 border bg-white px-3 text-sm"
									disabled={isSetPrimaryImagePending}
									onClick={() => setPrimaryImage({ imageId: picked.id, productId })}
									type="button"
								>
									<Star className="size-4" /> Үндсэн болгох
								</button>
							)}
							<button
								className="flex h-9 items-center gap-1.5 border border-red-300 bg-white px-3 text-sm text-red-700"
								disabled={isDeleteImagePending}
								onClick={() => deleteImage({ id: picked.id })}
								type="button"
							>
								<Trash2 className="size-4" /> Устгах
							</button>
						</div>
					) : null}
				</>
			) : (
				<p className="text-muted-foreground px-4 py-6 text-center text-sm">Зураг алга</p>
			)}
		</section>
	);
}

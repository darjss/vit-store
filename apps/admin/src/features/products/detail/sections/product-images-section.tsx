import { Check, Image as ImageIcon, Loader2, Sparkles, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UploadButton } from "@/components/upload-button";
import type { RouterOutputs } from "@/lib/types";

type Product = RouterOutputs["product"]["getProductById"];

type ProductDetailImagesSectionProps = {
	addImage: (input: { productId: number; url: string }) => void;
	currentFeaturedImage: Product["images"][number] | undefined;
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

export function ProductDetailImagesSection({
	addImage,
	currentFeaturedImage,
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
	return (
		<div className="border-border bg-card shadow-hard border-2">
			<div className="border-border flex items-center justify-between border-b-2 px-4 py-3 sm:px-6">
				<h2 className="font-heading flex items-center gap-2 text-base sm:text-lg">
					<ImageIcon className="h-4 w-4" />
					Зурагнууд
					{product.images && product.images.length > 0 && (
						<span className="border-border bg-muted text-muted-foreground ml-1 border-2 px-1.5 py-0.5 font-mono text-xs">
							{product.images.length}
						</span>
					)}
				</h2>
				<div className="flex items-center gap-2">
					<Button
						className="gap-1.5"
						disabled={isRegenerateProductImagesPending}
						onClick={() => {
							console.info("aiProduct.regenerateProductImages.mutate", {
								productId,
							});
							regenerateProductImages({ productId });
						}}
						size="sm"
						type="button"
						variant="outline"
					>
						{isRegenerateProductImagesPending ? (
							<Loader2 className="h-3.5 w-3.5 animate-spin" />
						) : (
							<Sparkles className="h-3.5 w-3.5" />
						)}
						AI дахин татах
					</Button>
					<UploadButton
						category="product"
						onSuccess={(url) => {
							addImage({ productId, url });
						}}
					/>
				</div>
			</div>

			<div className="p-4 sm:p-6">
				{product.images && product.images.length > 0 ? (
					<div className="flex flex-col gap-4 sm:flex-row">
						<div className="border-border bg-muted relative aspect-square w-full overflow-hidden border-2 sm:w-64 sm:shrink-0 md:w-80">
							{currentFeaturedImage && (
								<img
									alt={`Бүтээгдэхүүн ${currentFeaturedImage.id}`}
									className="h-full w-full object-cover"
									src={currentFeaturedImage.url}
								/>
							)}
							{currentFeaturedImage?.isPrimary && (
								<div className="border-border bg-primary font-heading text-primary-foreground absolute top-0 left-0 border-r-2 border-b-2 px-2 py-1 text-xs">
									<Star className="mr-1 inline-block h-3 w-3" />
									Үндсэн
								</div>
							)}
						</div>

						<div className="grid flex-1 auto-rows-min grid-cols-4 gap-2 sm:grid-cols-3 md:grid-cols-4">
							{product.images.map((image, index) => (
								<div className="group relative" key={image.id}>
									<button
										className={`aspect-square w-full overflow-hidden border-2 transition-all ${
											index === featuredImageIndex
												? "border-primary shadow-hard-sm"
												: "border-border hover:border-foreground/50"
										}`}
										onClick={() => onFeaturedImageChange(index)}
										type="button"
									>
										<img
											alt={`Бүтээгдэхүүн ${image.id}`}
											className="h-full w-full object-cover"
											src={image.url}
										/>
									</button>
									<div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
										{!image.isPrimary && (
											<Button
												className="h-7 w-7 bg-white/90 hover:bg-white"
												disabled={isSetPrimaryImagePending}
												onClick={() =>
													setPrimaryImage({
														imageId: image.id,
														productId,
													})
												}
												size="icon"
												variant="secondary"
											>
												{isSetPrimaryImagePending ? (
													<Loader2 className="h-3 w-3 animate-spin" />
												) : (
													<Check className="h-3 w-3" />
												)}
											</Button>
										)}
										<Button
											className="h-7 w-7 bg-red-500/90 hover:bg-red-500"
											disabled={isDeleteImagePending}
											onClick={() => deleteImage({ id: image.id })}
											size="icon"
											variant="destructive"
										>
											{isDeleteImagePending ? (
												<Loader2 className="h-3 w-3 animate-spin" />
											) : (
												<Trash2 className="h-3 w-3" />
											)}
										</Button>
									</div>
									{image.isPrimary && (
										<div className="bg-primary absolute right-0 bottom-0 p-0.5">
											<Star className="text-primary-foreground h-2.5 w-2.5" />
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				) : (
					<div className="border-border bg-muted/20 flex flex-col items-center justify-center border-2 border-dashed py-12">
						<ImageIcon className="text-muted-foreground/40 mb-3 h-10 w-10" />
						<p className="font-heading text-muted-foreground text-sm">Зураг байршуулаагүй байна</p>
						<p className="text-muted-foreground/60 mt-1 text-xs">
							Дээрх товчийг ашиглан зураг нэмнэ үү
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

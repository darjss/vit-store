import { Image } from "@unpic/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadButton } from "@/components/upload-button";

type ProductImage = { id?: number; url: string };

type ProductImagesSectionProps = {
	append: (value: ProductImage | Array<ProductImage>) => void;
	images: Array<ProductImage>;
	onRemove: (index: number) => void;
};

export function ProductImagesSection({ append, images, onRemove }: ProductImagesSectionProps) {
	return (
		<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg md:col-span-2">
			<CardContent className="space-y-4 p-6">
				<h3 className="mb-4 text-xl font-semibold">Бүтээгдэхүүний зураг</h3>
				{images.length > 0 && (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
						{images.map((image, i) => (
							<div
								className="group border-border bg-muted relative aspect-square overflow-hidden border-2"
								key={`${image.url}-${i}`}
							>
								<Button
									aria-label="Зураг устгах"
									className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 hover:opacity-100"
									onClick={() => onRemove(i)}
									size="icon"
									type="button"
									variant="destructive"
								>
									<X className="h-4 w-4" />
								</Button>
								<Image
									alt={`Бүтээгдэхүүний зураг ${i + 1}`}
									className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									height={400}
									src={image.url}
									width={400}
								/>
								{i === 0 && (
									<div className="bg-primary text-primary-foreground absolute bottom-0 left-0 px-2 py-0.5 text-xs font-bold">
										Үндсэн
									</div>
								)}
							</div>
						))}
					</div>
				)}
				<UploadButton append={append} category="product" onSuccess={() => {}} />
			</CardContent>
		</Card>
	);
}

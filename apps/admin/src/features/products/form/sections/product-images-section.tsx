import { Image } from "@unpic/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { UploadButton } from "@/components/upload-button";

type ProductImage = { url: string; id?: number };

type ProductImagesSectionProps = {
	images: ProductImage[];
	onRemove: (index: number) => void;
	append: (value: ProductImage | ProductImage[]) => void;
};

export function ProductImagesSection({
	images,
	onRemove,
	append,
}: ProductImagesSectionProps) {
	return (
		<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg md:col-span-2">
			<CardContent className="space-y-4 p-6">
				<h3 className="mb-4 font-semibold text-xl">Бүтээгдэхүүний зураг</h3>
				{images.length > 0 && (
					<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
						{images.map((image, i) => (
							<div
								key={`${image.url}-${i}`}
								className="group relative aspect-square overflow-hidden border-2 border-border bg-muted"
							>
								<Button
									type="button"
									variant="destructive"
									size="icon"
									onClick={() => onRemove(i)}
									className="absolute top-2 right-2 z-10 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
									aria-label="Зураг устгах"
								>
									<X className="h-4 w-4" />
								</Button>
								<Image
									src={image.url}
									alt={`Бүтээгдэхүүний зураг ${i + 1}`}
									width={400}
									height={400}
									className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
								/>
								{i === 0 && (
									<div className="absolute bottom-0 left-0 bg-primary px-2 py-0.5 font-bold text-primary-foreground text-xs">
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

import { useState } from "react";

type ProductImage = {
	id: number;
	isPrimary: boolean;
	url: string;
};

export function useProductFeaturedImage(images: Array<ProductImage> | undefined) {
	// Start on the primary image, the one the store shows.
	const [featuredImageIndex, setFeaturedImageIndex] = useState(() =>
		Math.max(0, images?.findIndex((img) => img.isPrimary) ?? 0),
	);

	const primaryImage = images?.find((img) => img.isPrimary);
	const currentFeaturedImage = images?.[featuredImageIndex] || primaryImage;

	return {
		currentFeaturedImage,
		featuredImageIndex,
		primaryImage,
		setFeaturedImageIndex,
	};
}

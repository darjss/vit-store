import { useState } from "react";

type ProductImage = {
	id: number;
	isPrimary: boolean;
	url: string;
};

export function useProductFeaturedImage(images: Array<ProductImage> | undefined) {
	const [featuredImageIndex, setFeaturedImageIndex] = useState(0);

	const primaryImage = images?.find((img) => img.isPrimary);
	const currentFeaturedImage = images?.[featuredImageIndex] || primaryImage;

	return {
		currentFeaturedImage,
		featuredImageIndex,
		primaryImage,
		setFeaturedImageIndex,
	};
}

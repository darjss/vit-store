import { useState } from "react";

type ProductImage = {
	id: number;
	url: string;
	isPrimary: boolean;
};

export function useProductFeaturedImage(images: ProductImage[] | undefined) {
	const [featuredImageIndex, setFeaturedImageIndex] = useState(0);

	const primaryImage = images?.find((img) => img.isPrimary);
	const currentFeaturedImage =
		images?.[featuredImageIndex] || primaryImage;

	return {
		featuredImageIndex,
		setFeaturedImageIndex,
		primaryImage,
		currentFeaturedImage,
	};
}

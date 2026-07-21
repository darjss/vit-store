export interface CartItems {
	productId: number;
	quantity: number;
	name: string;
	price: number;
	image: string;
	slug: string;
}

export interface ProductForHome {
	id: number;
	slug: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	amount?: string | null;
	price: number;
	image: string;
	brand: string;
	discount?: number | null;
	stock?: number;
}

export interface ProductImage {
	url: string;
	isPrimary: boolean;
}

export interface ProductDetail {
	id: number;
	name: string;
	price: number;
	status: string;
	description?: string | null;
	discount?: number | null;
	amount?: string | null;
	potency?: string | null;
	dailyIntake?: string | null;
	categoryId: number;
	brandId: number;
	ingredients?: string | null;
	weightGrams?: number | null;
	expirationDate?: string | null;
	seoTitle?: string | null;
	seoDescription?: string | null;
	images: ProductImage[];
	brand: { name: string };
	category: { name: string };
}

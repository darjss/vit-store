export interface CartItems {
	image: string;
	name: string;
	price: number;
	productId: number;
	quantity: number;
	slug: string;
}

export interface ProductForHome {
	amount?: string | null;
	brand: string;
	discount?: number | null;
	id: number;
	image: string;
	name: string;
	nameMn?: string | null;
	potency?: string | null;
	price: number;
	slug: string;
	stock?: number;
}

export interface ProductImage {
	isPrimary: boolean;
	url: string;
}

export interface ProductDetail {
	amount?: string | null;
	brand: { name: string };
	brandId: number;
	category: { name: string };
	categoryId: number;
	dailyIntake?: string | null;
	description?: string | null;
	discount?: number | null;
	expirationDate?: string | null;
	id: number;
	images: Array<ProductImage>;
	ingredients?: string | null;
	name: string;
	potency?: string | null;
	price: number;
	seoDescription?: string | null;
	seoTitle?: string | null;
	status: string;
	weightGrams?: number | null;
}

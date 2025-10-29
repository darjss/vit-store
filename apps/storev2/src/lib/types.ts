export interface CartItems {
	productId: number;
	quantity: number;
	name: string;
	price: number;
	image: string;
}

export interface ProductForHome {
	id: number;
	name: string;
	price: number;
	image: string;
	brand: string;
	discount?: number;
}

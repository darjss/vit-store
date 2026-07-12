import { and, eq, isNull } from "drizzle-orm";
import { ProductImagesTable } from "~/db/schema";

/** Complete product-card selection. Every storefront listing/search opts into
 * this contract so localized comparison fields cannot drift by query path. */
export const storefrontCardColumns = {
	id: true,
	slug: true,
	name: true,
	name_mn: true,
	potency: true,
	amount: true,
	price: true,
	discount: true,
	stock: true,
	status: true,
	categoryId: true,
} as const;

export const storefrontCardRelations = {
	images: {
		columns: { url: true },
		where: and(
			eq(ProductImagesTable.isPrimary, true),
			isNull(ProductImagesTable.deletedAt),
		),
	},
	brand: {
		columns: { name: true },
	},
} as const;

export interface StorefrontCardRow {
	id: number;
	slug: string;
	name: string;
	name_mn: string | null;
	potency: string | null;
	amount: string | null;
	price: number;
	discount: number | null;
	stock: number;
	status: string;
	categoryId: number;
	images: { url: string }[];
	brand: { name: string };
}

export const projectStorefrontCard = (product: StorefrontCardRow) => ({
	id: product.id,
	slug: product.slug,
	name: product.name,
	nameMn: product.name_mn,
	potency: product.potency,
	amount: product.amount,
	price: product.price,
	image: product.images[0]?.url ?? "",
	brand: product.brand.name,
	discount: product.discount ?? 0,
	stock: product.stock,
	status: product.status,
	categoryId: product.categoryId,
});

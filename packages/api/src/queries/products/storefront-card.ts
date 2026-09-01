import { and, eq, isNull } from "drizzle-orm";
import { ProductImagesTable } from "~/db/schema";

/** Complete product-card selection. Every storefront listing/search opts into
 * this contract so localized comparison fields cannot drift by query path. */
export const storefrontCardColumns = {
	amount: true,
	categoryId: true,
	discount: true,
	id: true,
	name: true,
	name_mn: true,
	potency: true,
	price: true,
	slug: true,
	status: true,
	stock: true,
} as const;

export const storefrontCardRelations = {
	brand: {
		columns: { name: true },
	},
	images: {
		columns: { url: true },
		where: and(eq(ProductImagesTable.isPrimary, true), isNull(ProductImagesTable.deletedAt)),
	},
} as const;

export interface StorefrontCardRow {
	amount: string | null;
	brand: { name: string };
	categoryId: number;
	discount: number | null;
	id: number;
	images: Array<{ url: string }>;
	name: string;
	name_mn: string | null;
	potency: string | null;
	price: number;
	slug: string;
	status: string;
	stock: number;
}

export const projectStorefrontCard = (product: StorefrontCardRow) => ({
	amount: product.amount,
	brand: product.brand.name,
	categoryId: product.categoryId,
	discount: product.discount ?? 0,
	id: product.id,
	image: product.images[0]?.url ?? "",
	name: product.name,
	nameMn: product.name_mn,
	potency: product.potency,
	price: product.price,
	slug: product.slug,
	status: product.status,
	stock: product.stock,
});

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { ProductImagesTable } from "../db/schema";

export const productImageQueries = {
	admin: {
		async createImage(data: {
			productId: number;
			url: string;
			isPrimary?: boolean;
		}) {
			await db().insert(ProductImagesTable).values(data);
		},

		async createImages(
			images: Array<{
				productId: number;
				url: string;
				isPrimary: boolean;
			}>,
		) {
			await db().insert(ProductImagesTable).values(images);
		},

		async getImagesByProductId(productId: number) {
			return db()
				.select({
					id: ProductImagesTable.id,
					productId: ProductImagesTable.productId,
					url: ProductImagesTable.url,
					isPrimary: ProductImagesTable.isPrimary,
					createdAt: ProductImagesTable.createdAt,
				})
				.from(ProductImagesTable)
				.where(
					and(
						eq(ProductImagesTable.productId, productId),
						isNull(ProductImagesTable.deletedAt),
					),
				)
				.orderBy(ProductImagesTable.isPrimary);
		},

		async getAllImages() {
			return db()
				.select({
					id: ProductImagesTable.id,
					productId: ProductImagesTable.productId,
					url: ProductImagesTable.url,
					isPrimary: ProductImagesTable.isPrimary,
					createdAt: ProductImagesTable.createdAt,
				})
				.from(ProductImagesTable)
				.orderBy(ProductImagesTable.createdAt);
		},

		async deleteImage(id: number) {
			await db()
				.update(ProductImagesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(ProductImagesTable.id, id),
						isNull(ProductImagesTable.deletedAt),
					),
				);
		},

		async softDeleteImagesByProductId(productId: number) {
			await db()
				.update(ProductImagesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(ProductImagesTable.productId, productId),
						isNull(ProductImagesTable.deletedAt),
					),
				);
		},

		async setPrimaryImage(productId: number, imageId: number) {
			await db()
				.update(ProductImagesTable)
				.set({ isPrimary: false })
				.where(
					and(
						eq(ProductImagesTable.productId, productId),
						isNull(ProductImagesTable.deletedAt),
					),
				);

			await db()
				.update(ProductImagesTable)
				.set({ isPrimary: true })
				.where(eq(ProductImagesTable.id, imageId));
		},

		async updateImage(id: number, data: { deletedAt?: Date | null }) {
			await db()
				.update(ProductImagesTable)
				.set(data)
				.where(
					and(
						eq(ProductImagesTable.id, id),
						isNull(ProductImagesTable.deletedAt),
					),
				);
		},
	},
};

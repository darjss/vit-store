import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable } from "~/db/schema";

export const productImageQueries = {
	admin: {
		async createImage(data: { isPrimary?: boolean; productId: number; url: string }) {
			await db().insert(ProductImagesTable).values(data);
		},

		async createImages(
			images: Array<{
				isPrimary: boolean;
				productId: number;
				url: string;
			}>,
		) {
			await db().insert(ProductImagesTable).values(images);
		},

		async deleteImage(id: number) {
			await db()
				.update(ProductImagesTable)
				.set({ deletedAt: new Date() })
				.where(and(eq(ProductImagesTable.id, id), isNull(ProductImagesTable.deletedAt)));
		},

		async getAllImages() {
			return db()
				.select({
					createdAt: ProductImagesTable.createdAt,
					id: ProductImagesTable.id,
					isPrimary: ProductImagesTable.isPrimary,
					productId: ProductImagesTable.productId,
					url: ProductImagesTable.url,
				})
				.from(ProductImagesTable)
				.orderBy(ProductImagesTable.createdAt);
		},

		async getImageById(id: number) {
			return db()
				.select({ productId: ProductImagesTable.productId })
				.from(ProductImagesTable)
				.where(and(eq(ProductImagesTable.id, id), isNull(ProductImagesTable.deletedAt)))
				.limit(1)
				.then((rows) => rows[0]);
		},

		async getImagesByProductId(productId: number) {
			return db()
				.select({
					createdAt: ProductImagesTable.createdAt,
					id: ProductImagesTable.id,
					isPrimary: ProductImagesTable.isPrimary,
					productId: ProductImagesTable.productId,
					url: ProductImagesTable.url,
				})
				.from(ProductImagesTable)
				.where(
					and(eq(ProductImagesTable.productId, productId), isNull(ProductImagesTable.deletedAt)),
				)
				.orderBy(ProductImagesTable.isPrimary);
		},

		async setPrimaryImage(productId: number, imageId: number) {
			await db()
				.update(ProductImagesTable)
				.set({ isPrimary: false })
				.where(
					and(eq(ProductImagesTable.productId, productId), isNull(ProductImagesTable.deletedAt)),
				);

			await db()
				.update(ProductImagesTable)
				.set({ isPrimary: true })
				.where(eq(ProductImagesTable.id, imageId));
		},

		async softDeleteImagesByProductId(productId: number) {
			await db()
				.update(ProductImagesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(eq(ProductImagesTable.productId, productId), isNull(ProductImagesTable.deletedAt)),
				);
		},

		async updateImage(id: number, data: { deletedAt?: Date | null }) {
			await db()
				.update(ProductImagesTable)
				.set(data)
				.where(and(eq(ProductImagesTable.id, id), isNull(ProductImagesTable.deletedAt)));
		},
	},
};

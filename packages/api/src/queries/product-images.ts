import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/db/client";
import { ProductImagesTable } from "~/db/schema";

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

		async getImageById(id: number) {
			return db()
				.select({ productId: ProductImagesTable.productId })
				.from(ProductImagesTable)
				.where(
					and(
						eq(ProductImagesTable.id, id),
						isNull(ProductImagesTable.deletedAt),
					),
				)
				.limit(1)
				.then((rows) => rows[0]);
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
			const result = await db()
				.update(ProductImagesTable)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(ProductImagesTable.id, id),
						isNull(ProductImagesTable.deletedAt),
					),
				)
				.returning({ id: ProductImagesTable.id });
			return result[0] ?? null;
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
			return db().transaction(async (tx) => {
				const [image] = await tx
					.select({ id: ProductImagesTable.id })
					.from(ProductImagesTable)
					.where(
						and(
							eq(ProductImagesTable.id, imageId),
							eq(ProductImagesTable.productId, productId),
							isNull(ProductImagesTable.deletedAt),
						),
					)
					.for("update");
				if (!image) return null;

				await tx
					.update(ProductImagesTable)
					.set({ isPrimary: false })
					.where(
						and(
							eq(ProductImagesTable.productId, productId),
							isNull(ProductImagesTable.deletedAt),
						),
					);
				await tx
					.update(ProductImagesTable)
					.set({ isPrimary: true })
					.where(eq(ProductImagesTable.id, imageId));
				return image;
			});
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

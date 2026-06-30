import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "~/db/client";
import { BrandsTable, ProductsTable } from "~/db/schema";

export const brandQueries = {
	admin: {
		async getAllBrands() {
			const productCount = sql<number>`count(${ProductsTable.id})`;

			return db()
				.select({
					id: BrandsTable.id,
					name: BrandsTable.name,
					slug: BrandsTable.slug,
					logoUrl: BrandsTable.logoUrl,
					description: BrandsTable.description,
					bannerImage: BrandsTable.bannerImage,
					seoTitle: BrandsTable.seoTitle,
					seoDescription: BrandsTable.seoDescription,
					createdAt: BrandsTable.createdAt,
					updatedAt: BrandsTable.updatedAt,
					deletedAt: BrandsTable.deletedAt,
					productCount,
				})
				.from(BrandsTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.brandId, BrandsTable.id),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(isNull(BrandsTable.deletedAt))
				.groupBy(
					BrandsTable.id,
					BrandsTable.name,
					BrandsTable.slug,
					BrandsTable.logoUrl,
					BrandsTable.description,
					BrandsTable.bannerImage,
					BrandsTable.seoTitle,
					BrandsTable.seoDescription,
					BrandsTable.createdAt,
					BrandsTable.updatedAt,
					BrandsTable.deletedAt,
				)
				.orderBy(desc(productCount), asc(BrandsTable.name));
		},

		async createBrand(data: {
			name: string;
			slug: string;
			logoUrl: string;
			description?: string | null;
			bannerImage?: string | null;
			seoTitle?: string | null;
			seoDescription?: string | null;
		}) {
			const result = await db().insert(BrandsTable).values(data).returning();
			return result[0];
		},

		async updateBrand(
			id: number,
			data: {
				name: string;
				slug: string;
				logoUrl: string;
				description?: string | null;
				bannerImage?: string | null;
				seoTitle?: string | null;
				seoDescription?: string | null;
			},
		) {
			await db()
				.update(BrandsTable)
				.set(data)
				.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
		},

		async deleteBrand(id: number) {
			await db()
				.update(BrandsTable)
				.set({ deletedAt: new Date() })
				.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)));
		},
	},

	store: {
		async getAllBrands() {
			const productCount = sql<number>`count(${ProductsTable.id})`;

			return db()
				.select({
					id: BrandsTable.id,
					name: BrandsTable.name,
					slug: BrandsTable.slug,
					logoUrl: BrandsTable.logoUrl,
					productCount,
				})
				.from(BrandsTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.brandId, BrandsTable.id),
						eq(ProductsTable.status, "active"),
						gt(ProductsTable.stock, 0),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(isNull(BrandsTable.deletedAt))
				.groupBy(
					BrandsTable.id,
					BrandsTable.name,
					BrandsTable.slug,
					BrandsTable.logoUrl,
				)
				.having(sql`count(${ProductsTable.id}) > 0`)
				.orderBy(desc(productCount), asc(BrandsTable.name));
		},

		async getBrandById(id: number) {
			const productCount = sql<number>`count(${ProductsTable.id})`;

			const result = await db()
				.select({
					id: BrandsTable.id,
					name: BrandsTable.name,
					slug: BrandsTable.slug,
					logoUrl: BrandsTable.logoUrl,
					description: BrandsTable.description,
					bannerImage: BrandsTable.bannerImage,
					seoTitle: BrandsTable.seoTitle,
					seoDescription: BrandsTable.seoDescription,
					productCount,
				})
				.from(BrandsTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.brandId, BrandsTable.id),
						eq(ProductsTable.status, "active"),
						gt(ProductsTable.stock, 0),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(and(eq(BrandsTable.id, id), isNull(BrandsTable.deletedAt)))
				.groupBy(
					BrandsTable.id,
					BrandsTable.name,
					BrandsTable.slug,
					BrandsTable.logoUrl,
					BrandsTable.description,
					BrandsTable.bannerImage,
					BrandsTable.seoTitle,
					BrandsTable.seoDescription,
				)
				.having(sql`count(${ProductsTable.id}) > 0`)
				.limit(1);

			return result[0] || null;
		},

		async getBrandBySlug(slug: string) {
			const productCount = sql<number>`count(${ProductsTable.id})`;

			const result = await db()
				.select({
					id: BrandsTable.id,
					name: BrandsTable.name,
					slug: BrandsTable.slug,
					logoUrl: BrandsTable.logoUrl,
					description: BrandsTable.description,
					bannerImage: BrandsTable.bannerImage,
					seoTitle: BrandsTable.seoTitle,
					seoDescription: BrandsTable.seoDescription,
					productCount,
				})
				.from(BrandsTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.brandId, BrandsTable.id),
						eq(ProductsTable.status, "active"),
						gt(ProductsTable.stock, 0),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(and(eq(BrandsTable.slug, slug), isNull(BrandsTable.deletedAt)))
				.groupBy(
					BrandsTable.id,
					BrandsTable.name,
					BrandsTable.slug,
					BrandsTable.logoUrl,
					BrandsTable.description,
					BrandsTable.bannerImage,
					BrandsTable.seoTitle,
					BrandsTable.seoDescription,
				)
				.having(sql`count(${ProductsTable.id}) > 0`)
				.limit(1);

			return result[0] || null;
		},

		async getAllBrandsWithStock() {
			const productCount = sql<number>`count(${ProductsTable.id})`;

			return db()
				.select({
					id: BrandsTable.id,
					name: BrandsTable.name,
					slug: BrandsTable.slug,
					logoUrl: BrandsTable.logoUrl,
					productCount,
				})
				.from(BrandsTable)
				.leftJoin(
					ProductsTable,
					and(
						eq(ProductsTable.brandId, BrandsTable.id),
						eq(ProductsTable.status, "active"),
						gt(ProductsTable.stock, 0),
						isNull(ProductsTable.deletedAt),
					),
				)
				.where(isNull(BrandsTable.deletedAt))
				.groupBy(
					BrandsTable.id,
					BrandsTable.name,
					BrandsTable.slug,
					BrandsTable.logoUrl,
				)
				.having(sql`count(${ProductsTable.id}) > 0`)
				.orderBy(desc(productCount), asc(BrandsTable.name));
		},
	},
};

/**
 * PROTOTYPE — dump real admin data to JSON for the admin-v2 UI prototype.
 * Reads the same env the repo scripts use (DIRECT_DB_URL or PLANETSCALE_*),
 * queries the real database, writes data.json.
 *
 * Requires a checkout with `.env` and `node_modules` (needs the `postgres`
 * driver). Run from the repo root:
 *   bun scripts/dump-admin-prototype-data.ts [output.json]
 */
import { config } from "dotenv";
import postgres from "postgres";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: join(process.cwd(), ".env") });

function getDbUrl(): string {
	if (process.env.DIRECT_DB_URL) return process.env.DIRECT_DB_URL;
	if (
		process.env.PLANETSCALE_USER &&
		process.env.PLANETSCALE_PASSWORD &&
		process.env.PLANETSCALE_HOST &&
		process.env.PLANETSCALE_DATABASE
	) {
		return `postgres://${process.env.PLANETSCALE_USER}:${process.env.PLANETSCALE_PASSWORD}@${process.env.PLANETSCALE_HOST}/${process.env.PLANETSCALE_DATABASE}?sslmode=require`;
	}
	throw new Error("DIRECT_DB_URL or PLANETSCALE_* variables are missing in .env");
}

const sql = postgres(getDbUrl(), { max: 3 });
const UB_TZ = "Asia/Ulaanbaatar";

async function main() {
	const orderCounts = await sql<{ status: string; count: number }[]>`
		select status, count(*)::int as count from ecom_vit_order where deleted_at is null group by status`;
	const paymentCounts = await sql<{ status: string; count: number }[]>`
		select status, count(*)::int as count from ecom_vit_payment where deleted_at is null group by status`;

	const lowStock = await sql<{
		id: number; name: string; name_mn: string | null; price: number;
		stock: number; status: string; brand: string; category: string; image: string | null;
	}[]>`select p.id, p.name, p.name_mn, p.price, p.stock, p.status,
			b.name as brand, c.name as category,
			(select pi.url from ecom_vit_product_image pi
			 where pi.product_id = p.id and pi.deleted_at is null and pi.is_primary = true limit 1) as image
		from ecom_vit_product p
		join ecom_vit_brand b on b.id = p.brand_id
		join ecom_vit_category c on c.id = p.category_id
		where p.deleted_at is null and p.stock <= 3
		order by p.stock asc, p.updated_at desc limit 12`;

	const products = await sql<{
		id: number; name: string; name_mn: string | null; price: number;
		stock: number; status: string; brand: string; category: string; image: string | null;
	}[]>`select p.id, p.name, p.name_mn, p.price, p.stock, p.status,
			b.name as brand, c.name as category,
			(select pi.url from ecom_vit_product_image pi
			 where pi.product_id = p.id and pi.deleted_at is null and pi.is_primary = true limit 1) as image
		from ecom_vit_product p
		join ecom_vit_brand b on b.id = p.brand_id
		join ecom_vit_category c on c.id = p.category_id
		where p.deleted_at is null
		order by p.updated_at desc limit 16`;

	const orders = await sql<{
		id: number; order_number: string; customer_phone: number; address: string | null;
		status: string; total: number; created_at: Date;
		payment_status: string | null; payment_provider: string | null; payment_created: Date | null;
	}[]>`select o.id, o.order_number, o.customer_phone, o.address, o.status, o.total, o.created_at,
			py.status as payment_status, py.provider as payment_provider, py.created_at as payment_created
		from ecom_vit_order o
		left join lateral (
			select status, provider, created_at from ecom_vit_payment
			where order_id = o.id and deleted_at is null order by created_at desc limit 1
		) py on true
		where o.deleted_at is null
		order by o.created_at desc limit 10`;

	const orderIds = orders.map((o) => o.id);
	const items = orderIds.length
		? await sql<{ order_id: number; name: string; quantity: number; price: number; image: string | null }[]>`
			select od.order_id, p.name, od.quantity, coalesce(od.price, p.price) as price,
				(select pi.url from ecom_vit_product_image pi
				 where pi.product_id = p.id and pi.deleted_at is null and pi.is_primary = true limit 1) as image
			from ecom_vit_order_detail od
			join ecom_vit_product p on p.id = od.product_id
			where od.order_id = any(${orderIds}) and od.deleted_at is null
			order by od.id`
		: [];

	const topProducts = await sql<{ name: string; qty: number; revenue: number }[]>`
		select p.name, sum(od.quantity)::int as qty, sum(od.quantity * coalesce(od.price, p.price))::int as revenue
		from ecom_vit_order_detail od
		join ecom_vit_product p on p.id = od.product_id
		join ecom_vit_order o on o.id = od.order_id
		where od.deleted_at is null and o.deleted_at is null
			and o.status not in ('cancelled', 'refunded')
			and o.created_at >= now() - interval '30 days'
		group by p.name order by qty desc limit 6`;

	const metrics = await sql<{ orders_today: number; sales_today: number; orders_7d: number; sales_7d: number }[]>`
		select
			count(*) filter (where created_at >= date_trunc('day', now() at time zone ${UB_TZ}) at time zone 'UTC')::int as orders_today,
			coalesce(sum(total) filter (where created_at >= date_trunc('day', now() at time zone ${UB_TZ}) at time zone 'UTC' and status not in ('cancelled','refunded')), 0)::int as sales_today,
			count(*) filter (where created_at >= now() - interval '7 days')::int as orders_7d,
			coalesce(sum(total) filter (where created_at >= now() - interval '7 days' and status not in ('cancelled','refunded')), 0)::int as sales_7d
		from ecom_vit_order where deleted_at is null`;

	const by = (rows: { status: string; count: number }[], key: string) =>
		rows.find((r) => r.status === key)?.count ?? 0;

	const data = {
		meta: {
			storeName: "Америк Витамин",
			currency: "₮",
			timezone: UB_TZ,
			generatedAt: new Date().toISOString(),
			note: "Real data from the production database. Prototype only.",
		},
		workQueue: [
			{ kind: "created", label: "Шинэ захиалга", count: by(orderCounts, "created"), route: "/orders?status=created" },
			{ kind: "pending", label: "Төлбөр хүлээж буй", count: by(orderCounts, "pending"), route: "/orders?status=pending" },
			{ kind: "shipped", label: "Хүргэлтэд гарсан", count: by(orderCounts, "shipped"), route: "/orders?status=shipped" },
			{ kind: "low_stock", label: "Бага үлдэгдэл", count: lowStock.length, route: "/products?inventory=low" },
		],
		paymentStatus: {
			pending: by(paymentCounts, "pending"),
			customer_claimed_paid: by(paymentCounts, "customer_claimed_paid"),
			success: by(paymentCounts, "success"),
			failed: by(paymentCounts, "failed"),
		},
		metrics: metrics[0] ?? { orders_today: 0, sales_today: 0, orders_7d: 0, sales_7d: 0 },
		recentOrders: orders.map((o) => ({
			id: o.id,
			number: o.order_number,
			customerPhone: String(o.customer_phone),
			address: o.address,
			status: o.status,
			totalMnt: o.total,
			createdAt: o.created_at.toISOString(),
			paymentStatus: o.payment_status,
			paymentProvider: o.payment_provider,
			paymentCreatedAt: o.payment_created?.toISOString() ?? null,
			items: items.filter((i) => i.order_id === o.id).map((i) => ({
				name: i.name, qty: i.quantity, priceMnt: i.price, image: i.image,
			})),
		})),
		products,
		lowStock,
		topProducts: topProducts.map((t) => ({ name: t.name, qtySold: t.qty, revenueMnt: t.revenue })),
	};

	const outPath = process.argv[2] ?? join(process.cwd(), "data.json");
	writeFileSync(outPath, JSON.stringify(data, null, 2));
	console.log("wrote", outPath);
	console.log("orders:", data.recentOrders.length, "products:", data.products.length, "lowStock:", data.lowStock.length, "top:", data.topProducts.length);
	console.log("workQueue:", JSON.stringify(data.workQueue.map((w) => [w.label, w.count])));
	console.log("metrics:", JSON.stringify(data.metrics));
	await sql.end();
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});

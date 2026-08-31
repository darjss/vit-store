import postgres from "postgres";

const {
	PLANETSCALE_USER,
	PLANETSCALE_PASSWORD,
	PLANETSCALE_HOST,
	PLANETSCALE_DATABASE,
} = process.env;

if (
	!PLANETSCALE_USER ||
	!PLANETSCALE_PASSWORD ||
	!PLANETSCALE_HOST ||
	!PLANETSCALE_DATABASE
) {
	throw new Error("Missing production database variables");
}

const sql = postgres(
	`postgres://${PLANETSCALE_USER}:${PLANETSCALE_PASSWORD}@${PLANETSCALE_HOST}/${PLANETSCALE_DATABASE}?sslmode=require`,
	{ ssl: "require", max: 1, fetch_types: false },
);

try {
	const [summary, monthly, weekly] = await Promise.all([
		sql`
			SELECT
				count(*)::int AS payments,
				count(DISTINCT order_id)::int AS orders,
				min(updated_at) AS first_paid_at,
				max(updated_at) AS last_paid_at,
				sum(amount)::bigint AS revenue,
				round(avg(amount))::bigint AS average_order_value
			FROM ecom_vit_payment
			WHERE status = 'success' AND deleted_at IS NULL
		`,
		sql`
			SELECT
				to_char(date_trunc('month', updated_at), 'YYYY-MM') AS month,
				count(*)::int AS payments,
				sum(amount)::bigint AS revenue,
				round(avg(amount))::bigint AS average_order_value,
				round(100.0 * sum(amount) FILTER (WHERE provider = 'qpay') / sum(amount), 1) AS qpay_revenue_share
			FROM ecom_vit_payment
			WHERE status = 'success' AND deleted_at IS NULL AND updated_at IS NOT NULL
			GROUP BY 1
			ORDER BY 1
		`,
		sql`
			SELECT
				to_char(date_trunc('week', updated_at), 'YYYY-MM-DD') AS week_start,
				count(*)::int AS payments,
				sum(amount)::bigint AS revenue,
				round(avg(amount))::bigint AS average_order_value
			FROM ecom_vit_payment
			WHERE status = 'success' AND deleted_at IS NULL AND updated_at IS NOT NULL
			GROUP BY 1
			ORDER BY 1
		`,
	]);

	console.log(JSON.stringify({ summary, monthly, weekly }, null, 2));
} finally {
	await sql.end();
}

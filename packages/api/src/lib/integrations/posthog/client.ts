/**
 * PostHog server-side query client using the HTTP Query API.
 * Uses HogQL to query events collected from the storefront.
 *
 * Compatible with Cloudflare Workers (uses `fetch`, no Node.js dependencies).
 *
 * Required env vars:
 * - POSTHOG_PERSONAL_API_KEY: Personal API key with "query" read permission
 * - POSTHOG_PROJECT_ID: Numeric project ID
 * - POSTHOG_HOST: e.g. "https://us.i.posthog.com"
 */

export interface PostHogConfig {
	apiKey: string;
	projectId: string;
	host: string;
}

interface HogQLQueryResult {
	results: unknown[][];
	columns: string[];
	types: string[];
	hasMore?: boolean;
}

interface PostHogQueryResponse {
	results: unknown[][];
	columns: string[];
	types: string[];
	hasMore?: boolean;
	error?: string;
}

export class PostHogClient {
	private config: PostHogConfig;

	constructor(config: PostHogConfig) {
		this.config = config;
	}

	/**
	 * Execute a HogQL query against the PostHog Query API.
	 */
	async query(hogql: string): Promise<HogQLQueryResult> {
		const url = `${this.config.host}/api/projects/${this.config.projectId}/query/`;

		const response = await fetch(url, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.config.apiKey}`,
			},
			body: JSON.stringify({
				query: {
					kind: "HogQLQuery",
					query: hogql,
				},
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(
				`PostHog query failed (${response.status}): ${text.slice(0, 500)}`,
			);
		}

		const data = (await response.json()) as PostHogQueryResponse;

		if (data.error) {
			throw new Error(`PostHog HogQL error: ${data.error}`);
		}

		return {
			results: data.results,
			columns: data.columns,
			types: data.types,
			hasMore: data.hasMore,
		};
	}

	// ─── Convenience query methods ─────────────────────────────────────

	/**
	 * Get web analytics overview: unique visitors, pageviews, and event-based funnel counts.
	 *
	 * @param daysBack - number of days to look back (1=today, 7=week, 30=month)
	 */
	async getWebAnalytics(daysBack: number): Promise<{
		uniqueVisitors: number;
		pageviews: number;
		productViews: number;
		addToCarts: number;
		checkouts: number;
		orders: number;
		payments: number;
		searches: number;
	}> {
		const hogql = `
			SELECT
				uniqExact(person_id) AS unique_visitors,
				countIf(event = '$pageview') AS pageviews,
				countIf(event = 'product_viewed') AS product_views,
				countIf(event = 'add_to_cart') AS add_to_carts,
				countIf(event = 'checkout_started') AS checkouts,
				countIf(event = 'order_placed') AS orders,
				countIf(event = 'payment_confirmed') AS payments,
				countIf(event = 'search_performed') AS searches
			FROM events
			WHERE timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
		`;

		const result = await this.query(hogql);
		const row = result.results[0] || [];

		return {
			uniqueVisitors: Number(row[0]) || 0,
			pageviews: Number(row[1]) || 0,
			productViews: Number(row[2]) || 0,
			addToCarts: Number(row[3]) || 0,
			checkouts: Number(row[4]) || 0,
			orders: Number(row[5]) || 0,
			payments: Number(row[6]) || 0,
			searches: Number(row[7]) || 0,
		};
	}

	/**
	 * Get web analytics for a previous period (for percentage change calculations).
	 */
	async getWebAnalyticsPrevious(daysBack: number): Promise<{
		uniqueVisitors: number;
		pageviews: number;
		orders: number;
	}> {
		const hogql = `
			SELECT
				uniqExact(person_id) AS unique_visitors,
				countIf(event = '$pageview') AS pageviews,
				countIf(event = 'order_placed') AS orders
			FROM events
			WHERE timestamp >= now() - interval ${daysBack * 2} day
				AND timestamp < now() - interval ${daysBack} day
		`;

		const result = await this.query(hogql);
		const row = result.results[0] || [];

		return {
			uniqueVisitors: Number(row[0]) || 0,
			pageviews: Number(row[1]) || 0,
			orders: Number(row[2]) || 0,
		};
	}

	/**
	 * Get conversion funnel data: how many unique users reached each step.
	 */
	async getConversionFunnel(daysBack: number): Promise<{
		visitors: number;
		productViewers: number;
		cartAdders: number;
		checkoutStarters: number;
		orderPlacers: number;
		paymentConfirmers: number;
	}> {
		const hogql = `
			SELECT
				uniqExact(person_id) AS visitors,
				uniqExactIf(person_id, event = 'product_viewed') AS product_viewers,
				uniqExactIf(person_id, event = 'add_to_cart') AS cart_adders,
				uniqExactIf(person_id, event = 'checkout_started') AS checkout_starters,
				uniqExactIf(person_id, event = 'order_placed') AS order_placers,
				uniqExactIf(person_id, event = 'payment_confirmed') AS payment_confirmers
			FROM events
			WHERE timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
		`;

		const result = await this.query(hogql);
		const row = result.results[0] || [];

		return {
			visitors: Number(row[0]) || 0,
			productViewers: Number(row[1]) || 0,
			cartAdders: Number(row[2]) || 0,
			checkoutStarters: Number(row[3]) || 0,
			orderPlacers: Number(row[4]) || 0,
			paymentConfirmers: Number(row[5]) || 0,
		};
	}

	/**
	 * Get top search queries with result counts.
	 */
	async getTopSearches(
		daysBack: number,
		limit = 20,
	): Promise<
		Array<{
			query: string;
			count: number;
			avgResults: number;
			noResultCount: number;
		}>
	> {
		const hogql = `
			SELECT
				properties.query AS search_query,
				count() AS search_count,
				avg(properties.results_count) AS avg_results,
				countIf(properties.results_count = 0) AS no_result_count
			FROM events
			WHERE event = 'search_performed'
				AND timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
			GROUP BY search_query
			ORDER BY search_count DESC
			LIMIT ${limit}
		`;

		const result = await this.query(hogql);

		return result.results.map((row) => ({
			query: String(row[0] || ""),
			count: Number(row[1]) || 0,
			avgResults: Number(row[2]) || 0,
			noResultCount: Number(row[3]) || 0,
		}));
	}

	/**
	 * Get most viewed products.
	 */
	async getMostViewedProducts(
		daysBack: number,
		limit = 20,
	): Promise<
		Array<{
			productId: number;
			productName: string;
			productSlug: string;
			views: number;
			uniqueViewers: number;
			addToCartCount: number;
		}>
	> {
		const hogql = `
			SELECT
				properties.product_id AS product_id,
				any(properties.product_name) AS product_name,
				any(properties.product_slug) AS product_slug,
				count() AS view_count,
				uniqExact(person_id) AS unique_viewers,
				0 AS atc_placeholder
			FROM events
			WHERE event = 'product_viewed'
				AND timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
			GROUP BY product_id
			ORDER BY view_count DESC
			LIMIT ${limit}
		`;

		const result = await this.query(hogql);

		// Get add-to-cart counts for these products in a separate query
		const productIds = result.results.map((row) => Number(row[0]));
		let atcMap: Record<number, number> = {};

		if (productIds.length > 0) {
			try {
				const atcHogql = `
					SELECT
						properties.product_id AS product_id,
						count() AS atc_count
					FROM events
					WHERE event = 'add_to_cart'
						AND timestamp >= now() - interval ${daysBack} day
						AND timestamp <= now()
						AND properties.product_id IN (${productIds.join(",")})
					GROUP BY product_id
				`;
				const atcResult = await this.query(atcHogql);
				atcMap = Object.fromEntries(
					atcResult.results.map((row) => [Number(row[0]), Number(row[1])]),
				);
			} catch {
				// silently fail — atc data is supplementary
			}
		}

		return result.results.map((row) => ({
			productId: Number(row[0]) || 0,
			productName: String(row[1] || ""),
			productSlug: String(row[2] || ""),
			views: Number(row[3]) || 0,
			uniqueViewers: Number(row[4]) || 0,
			addToCartCount: atcMap[Number(row[0])] || 0,
		}));
	}

	/**
	 * Get per-product behavior analytics (views, add-to-cart, daily trend).
	 * Uses a single query with both aggregate stats and daily breakdown to
	 * stay within PostHog's concurrent query limit.
	 */
	async getProductBehavior(
		productId: number,
		daysBack: number,
	): Promise<{
		views: number;
		uniqueViewers: number;
		addToCartCount: number;
		searchClicks: number;
		dailyTrend: Array<{ date: string; views: number; addToCarts: number }>;
	}> {
		// Fetch aggregate stats first
		const statsHogql = `
			SELECT
				countIf(event = 'product_viewed') AS views,
				uniqExactIf(person_id, event = 'product_viewed') AS unique_viewers,
				countIf(event = 'add_to_cart') AS add_to_carts,
				countIf(event = 'search_result_clicked') AS search_clicks
			FROM events
			WHERE timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
				AND properties.product_id = ${productId}
		`;

		const statsResult = await this.query(statsHogql);
		const statsRow = statsResult.results[0] || [];

		// Then fetch daily trend
		const trendHogql = `
			SELECT
				toDate(timestamp) AS day,
				countIf(event = 'product_viewed') AS views,
				countIf(event = 'add_to_cart') AS add_to_carts
			FROM events
			WHERE timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
				AND properties.product_id = ${productId}
			GROUP BY day
			ORDER BY day ASC
		`;

		const trendResult = await this.query(trendHogql);

		return {
			views: Number(statsRow[0]) || 0,
			uniqueViewers: Number(statsRow[1]) || 0,
			addToCartCount: Number(statsRow[2]) || 0,
			searchClicks: Number(statsRow[3]) || 0,
			dailyTrend: trendResult.results.map((row) => ({
				date: String(row[0] || ""),
				views: Number(row[1]) || 0,
				addToCarts: Number(row[2]) || 0,
			})),
		};
	}

	/**
	 * Get daily visitor trend for chart display.
	 */
	async getDailyVisitorTrend(
		daysBack: number,
	): Promise<
		Array<{ date: string; visitors: number; pageviews: number; orders: number }>
	> {
		const hogql = `
			SELECT
				toDate(timestamp) AS day,
				uniqExact(person_id) AS visitors,
				countIf(event = '$pageview') AS pageviews,
				countIf(event = 'order_placed') AS orders
			FROM events
			WHERE timestamp >= now() - interval ${daysBack} day
				AND timestamp <= now()
			GROUP BY day
			ORDER BY day ASC
		`;

		const result = await this.query(hogql);

		return result.results.map((row) => ({
			date: String(row[0] || ""),
			visitors: Number(row[1]) || 0,
			pageviews: Number(row[2]) || 0,
			orders: Number(row[3]) || 0,
		}));
	}
}

/**
 * Create a PostHog client from Cloudflare Worker env vars.
 */
export function createPostHogClient(env: {
	POSTHOG_PERSONAL_API_KEY: string;
	POSTHOG_PROJECT_ID: string;
	POSTHOG_HOST: string;
}): PostHogClient {
	return new PostHogClient({
		apiKey: env.POSTHOG_PERSONAL_API_KEY,
		projectId: env.POSTHOG_PROJECT_ID,
		host: env.POSTHOG_HOST,
	});
}

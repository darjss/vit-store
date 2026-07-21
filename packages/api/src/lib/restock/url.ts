const PRODUCTION_STORE_URL = "https://amerikvitamin.mn";

export function getStorefrontBaseUrl(): string {
	const fromEnv =
		process.env.STORE_PUBLIC_URL ??
		process.env.PUBLIC_STORE_URL ??
		process.env.CORS_ORIGIN?.split(",")
			.map((origin) => origin.trim())
			.find(
				(origin) =>
					origin.includes("amerikvitamin.mn") &&
					!origin.includes("admin") &&
					!origin.includes("api") &&
					!origin.includes("staging"),
			);

	if (fromEnv && fromEnv.length > 0) {
		return fromEnv.replace(/\/$/, "");
	}

	return PRODUCTION_STORE_URL;
}

export function buildProductPdpUrl(slug: string, productId: number): string {
	return `${getStorefrontBaseUrl()}/products/${slug}-${productId}/`;
}

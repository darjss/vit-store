import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
	// Access Cloudflare runtime context
	const runtime = request.cf;

	return new Response(
		JSON.stringify({
			city: runtime?.city || "unknown",
			colo: runtime?.colo || "unknown",
			country: runtime?.country || "unknown",
			message: "Hello from Astro API on Cloudflare!",
			timestamp: new Date().toISOString(),
		}),
		{
			headers: {
				"Content-Type": "application/json",
			},
			status: 200,
		},
	);
};

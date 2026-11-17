import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";

export const prerender = false;

// Short payment link from the unpaid-order SMS. The API worker checks the
// code, sets the checkout session cookie and redirects to /payment/<n>.
export const GET: APIRoute = async ({ params, request }) => {
	const headers = new Headers(request.headers);
	headers.delete("host");
	const upstream = await env.server.fetch(
		new Request(`https://internal/pay/${encodeURIComponent(params.code ?? "")}`, {
			headers,
			redirect: "manual",
		}),
	);
	return new Response(null, upstream);
};

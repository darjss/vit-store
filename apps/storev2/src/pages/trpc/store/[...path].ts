import type { APIRoute } from "astro";

const getBackendUrl = () => {
	const apiUrlFromEnv = import.meta.env.PUBLIC_API_URL;

	return apiUrlFromEnv
		? `${apiUrlFromEnv}/trpc/store`
		: "http://localhost:3000/trpc/store";
};

export const prerender = false;

export const ALL: APIRoute = async ({ request, params }) => {
	const backendBaseUrl = getBackendUrl();
	const incomingUrl = new URL(request.url);
	const trpcPath = params.path ? `/${params.path}` : "";
	const targetUrl = new URL(`${backendBaseUrl}${trpcPath}`);
	targetUrl.search = incomingUrl.search;

	const headers = new Headers(request.headers);
	headers.set("host", targetUrl.host);
	headers.delete("content-length");

	return fetch(targetUrl, {
		method: request.method,
		headers,
		body: request.body,
		redirect: "manual",
		duplex: "half",
	} as RequestInit & { duplex: "half" });
};

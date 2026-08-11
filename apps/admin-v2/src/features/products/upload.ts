// Image upload boundary — preserves the current admin mechanism: a
// multipart POST to `/upload/products` on the API server with the admin
// session cookie. The server transcodes to webp, stores in R2, and returns
// the CDN url (see apps/server/src/routes/uploads.ts).
const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3000";

export async function uploadProductImage(
	image: File,
	productName?: string,
): Promise<string> {
	const formData = new FormData();
	formData.append("image", image);
	if (productName) formData.append("productName", productName);
	const response = await fetch(`${SERVER_URL}/upload/products`, {
		method: "POST",
		credentials: "include",
		body: formData,
	});
	const data = (await response.json()) as {
		url?: string;
		message?: string;
		status?: string;
	};
	if (response.ok && data.url) return data.url;
	throw new Error(
		data.message || `Зураг оруулах боломжгүй (${response.status})`,
	);
}

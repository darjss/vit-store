// Retention matching Meta's webhook retry horizon (~24h). After this window a
// dedupe record can no longer collide with a retry, so the DO self-cleans.
const RETENTION_MS = 24 * 60 * 60 * 1000;

export class MessengerAdmissionStore implements DurableObject {
	constructor(private readonly state: DurableObjectState) {}

	async fetch(request: Request): Promise<Response> {
		const key = decodeURIComponent(new URL(request.url).pathname.slice(1));
		if (key.length === 0) return new Response("Missing key", { status: 400 });

		if (request.method === "POST") {
			const existing = await this.state.storage.get(key);
			if (existing !== undefined) return Response.json({ admitted: false });

			await this.state.storage.put(key, 1);
			await this.state.storage.setAlarm(Date.now() + RETENTION_MS);
			return Response.json({ admitted: true });
		}

		if (request.method === "DELETE") {
			await this.state.storage.delete(key);
			return Response.json({ released: true });
		}

		return new Response("Not found", { status: 404 });
	}

	async alarm(): Promise<void> {
		await this.state.storage.deleteAll();
	}
}

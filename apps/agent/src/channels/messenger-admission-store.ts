export class MessengerAdmissionStore implements DurableObject {
	constructor(private readonly state: DurableObjectState) {}

	async fetch(request: Request): Promise<Response> {
		if (request.method !== "POST")
			return new Response("Not found", { status: 404 });
		const key = new URL(request.url).pathname.slice(1);
		if (key.length === 0) return new Response("Missing key", { status: 400 });

		const existing = await this.state.storage.get(key);
		if (existing !== undefined) return Response.json({ admitted: false });

		await this.state.storage.put(key, 1);
		return Response.json({ admitted: true });
	}
}

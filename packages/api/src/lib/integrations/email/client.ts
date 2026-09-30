import { env } from "cloudflare:workers";

function fromAddress(value: string) {
	const namedAddress = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
	if (!namedAddress) {
		return value.trim();
	}
	const name = namedAddress[1]?.trim();
	return name ? { email: namedAddress[2], name } : namedAddress[2];
}

export async function sendEmail(input: { subject: string; text: string; to: string }) {
	try {
		return await env.EMAIL.send({
			from: fromAddress(env.RESTOCK_FROM_EMAIL),
			subject: input.subject,
			text: input.text,
			to: input.to,
		});
	} catch {
		throw new Error("Failed to send email");
	}
}

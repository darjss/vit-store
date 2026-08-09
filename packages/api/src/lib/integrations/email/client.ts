import { env } from "cloudflare:workers";

function fromAddress(value: string) {
	const namedAddress = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
	if (!namedAddress) return value.trim();
	const name = namedAddress[1]?.trim();
	return name ? { email: namedAddress[2], name } : namedAddress[2];
}

export async function sendEmail(input: {
	to: string;
	subject: string;
	text: string;
}) {
	try {
		return await env.EMAIL.send({
			from: fromAddress(env.RESTOCK_FROM_EMAIL),
			to: input.to,
			subject: input.subject,
			text: input.text,
		});
	} catch {
		throw new Error("Failed to send email");
	}
}

import { Resend } from "resend";

export const resendClient = new Resend(process.env.RESEND_API_KEY ?? "");

export async function sendEmail(input: {
	to: string;
	subject: string;
	text: string;
}) {
	if (!process.env.RESEND_API_KEY) {
		throw new Error("RESEND_API_KEY is not configured");
	}

	const from =
		process.env.RESTOCK_FROM_EMAIL ?? "Vit Store <noreply@amerikvitamin.mn>";
	const result = await resendClient.emails.send({
		from,
		to: input.to,
		subject: input.subject,
		text: input.text,
	});

	if (result.error) {
		throw new Error(result.error.message || "Failed to send email");
	}

	return result.data;
}

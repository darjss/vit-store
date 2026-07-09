export function normalizeRestockContact(
	channel: "sms" | "email",
	contact: string,
): string {
	if (channel === "sms") {
		return contact.replace(/\D/g, "");
	}
	return contact.trim().toLowerCase();
}

export function isValidRestockContact(
	channel: "sms" | "email",
	normalizedContact: string,
): boolean {
	if (channel === "sms") {
		return /^[6-9]\d{7}$/.test(normalizedContact);
	}
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedContact);
}

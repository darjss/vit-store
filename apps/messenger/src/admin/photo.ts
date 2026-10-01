// Staged inbound image shared by the extract tools: raw bytes read back from
// the short-lived R2 object by key, plus the data-url content type the vision
// model receives.
export interface InboundImage {
	bytes: Uint8Array;
	contentType: string;
}

// Pull the first balanced JSON object out of model text. Tolerant of code
// fences and surrounding prose.
export const extractJsonObject = (text: string): string | undefined => {
	const start = text.indexOf("{");
	if (start === -1) {
		return undefined;
	}
	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let i = start; i < text.length; i += 1) {
		const ch = text[i];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
		} else if (ch === "{") {
			depth += 1;
		} else if (ch === "}") {
			depth -= 1;
			if (depth === 0) {
				return text.slice(start, i + 1);
			}
		}
	}
	return undefined;
};

import { existsSync, readFileSync } from "node:fs";

/** Parse a `.dev.vars` / dotenv file into key/value pairs. */
export function loadDotVars(file: string) {
	const entries: Array<[string, string]> = [];
	if (!existsSync(file)) {
		return Object.fromEntries(entries);
	}
	for (const line of readFileSync(file, "utf8").split("\n")) {
		const trimmed = line.trim();
		if (trimmed.length === 0 || trimmed.startsWith("#")) {
			continue;
		}
		const eq = trimmed.indexOf("=");
		if (eq === -1) {
			continue;
		}
		entries.push([trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim()]);
	}
	return Object.fromEntries(entries);
}

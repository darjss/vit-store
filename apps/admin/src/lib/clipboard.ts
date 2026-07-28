import { Result } from "better-result";

type ClipboardError = { _tag: "ClipboardUnavailable" };

export const copyToClipboard = async (
	text: string,
): Promise<Result<void, ClipboardError>> => {
	try {
		await navigator.clipboard.writeText(text);
		return Result.ok(undefined);
	} catch {
		return Result.err({ _tag: "ClipboardUnavailable" as const });
	}
};

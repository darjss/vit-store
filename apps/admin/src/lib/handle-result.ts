import type { Result } from "better-result";
import { showErrorPresentation } from "./error-presentations";
import type { ErrorPresentation } from "./error-presentations/types";

export const handleResult = <Value, Failure>(
	result: Result<Value, Failure>,
	onSuccess: (value: Value) => void,
	presentError: (error: Failure) => ErrorPresentation,
) =>
	result.match({
		ok: onSuccess,
		err: (error) => showErrorPresentation(presentError(error)),
	});

import type { AdminBatchFailure } from "@vit/shared";
import { Result } from "better-result";
import { batchPartiallyFailed } from "~/errors/factories/admin";

export const aggregateBatchResult = (
	total: number,
	failures: AdminBatchFailure[],
) => {
	const succeeded = total - failures.length;
	return failures.length > 0
		? Result.err(batchPartiallyFailed(total, succeeded, failures))
		: Result.ok({ total, succeeded });
};

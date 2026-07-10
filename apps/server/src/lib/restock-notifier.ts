import { runRestockSafetyNet } from "@vit/api/lib/restock";
import { createLogger } from "evlog";

function createRestockLogger() {
	return createLogger({
		operation: "restock.notifier",
		request_id: crypto.randomUUID(),
		user_type: "system",
	});
}

/**
 * Safety-net cron: notify open Postgres restock subscriptions for products
 * that are already active with stock > 0 (covers missed event hooks / send failures).
 *
 * TODO(rate-limit): CF rate-limit binding for public subscribeToRestock if
 * wrangler/alchemy binding is added later. Not configured today.
 */
export async function runRestockNotifier(_env: Env) {
	const log = createRestockLogger();

	try {
		const result = await runRestockSafetyNet();
		log.info("restock.safety_net_complete", result);
		log.emit();
	} catch (error) {
		log.error(error instanceof Error ? error : new Error(String(error)), {
			event: "restock.safety_net_failed",
		});
		log.emit();
		throw error;
	}
}

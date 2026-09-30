import { paymentQueries } from "@vit/api/queries";
import { confirmPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import type {
	TransferReconciliationState,
	TransferReconciliationStatus,
} from "@vit/api/lib/payments/transfer-reconciliation-status";
import { DurableObject } from "cloudflare:workers";
import {
	KhaanAuthError,
	KhaanClient,
	KhaanRateLimitError,
	type MatchedKhaanTransaction,
} from "khaan-client";
import {
	collectMatchingKhaanFingerprints,
	fingerprintOf,
	khaanTransactionFingerprint,
	matchKhaanTransfer,
	prepareEligibleKhaanTransactions,
} from "../lib/khaan/match-transfer";

const STATE_KEY = "transfer-reconciliation:state:v1";
const POLL_INTERVAL_MS = 25_000;
const RATE_LIMIT_BACKOFF_MS = 90_000;
const MAX_POLL_MS = 5 * 60_000;

type StartInput = {
	paymentNumber: string;
};

const terminalStatuses = new Set<TransferReconciliationStatus>([
	"confirmed",
	"timeout",
	"auth_required",
	"ambiguous",
	"failed",
]);

const errorMessage = (error: Error) => error.message;

const retryDelayMs = (error: Error) =>
	error instanceof KhaanRateLimitError ? RATE_LIMIT_BACKOFF_MS : POLL_INTERVAL_MS;

const isConfirmablePaymentStatus = (status: string) =>
	status === "pending" || status === "customer_claimed_paid";

export class TransferReconciliationObject extends DurableObject<Env> {
	private readonly appEnv: Env;
	private client: KhaanClient | null = null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.appEnv = env;
	}

	private async ensureClient(): Promise<KhaanClient> {
		if (this.client) {
			return this.client;
		}
		const client = new KhaanClient({
			accountNumber: this.appEnv.KHAAN_ACCOUNT_NUMBER,
			branchCode: this.appEnv.KHAAN_BRANCH_CODE,
			deviceId: this.appEnv.KHAAN_DEVICE_ID,
			password: this.appEnv.KHAAN_PASSWORD,
			userAgent: this.appEnv.KHAAN_USER_AGENT,
			username: this.appEnv.KHAAN_USERNAME,
		});
		await client.login();
		this.client = client;
		return client;
	}

	async start(input: StartInput): Promise<TransferReconciliationState> {
		const current = await this.getStoredState();
		if (current?.paymentNumber === input.paymentNumber && !terminalStatuses.has(current.status)) {
			return current;
		}

		const now = Date.now();
		const state: TransferReconciliationState = {
			attempts: 0,
			expiresAt: new Date(now + MAX_POLL_MS).toISOString(),
			lastError: null,
			nextPollAt: new Date(now + 1000).toISOString(),
			paymentNumber: input.paymentNumber,
			startedAt: new Date(now).toISOString(),
			status: "polling",
		};

		await this.writeState(state);
		await this.ctx.storage.setAlarm(now + 1000);
		return state;
	}

	async getStatus(): Promise<TransferReconciliationState | null> {
		return await this.getStoredState();
	}

	// Used by the admin manual-confirm path to find ALL Khaan transactions
	// matching this payment and return their fingerprints, so the admin
	// confirm can record them as consumed (P0-1). Returns null on any failure
	// (Khaan auth, fetch, payment not found) — the caller must NOT block the
	// admin confirm on a null return. Returns [] when no matching transactions
	// are found (tx scrolled out of the recent list, or a cash/override).
	async collectMatchingKhaanFingerprints(paymentNumber: string): Promise<Array<string> | null> {
		try {
			const payment = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
			if (!payment || payment.provider !== "transfer") {
				return null;
			}
			const client = await this.ensureClient();
			const transactions = await client.fetchTransactions();
			// Shared eligible pipeline (F3): window-filter → fingerprint →
			// consumed-lookup → eligible-filter in one pass. Fingerprints are
			// computed once and reused by collectMatchingKhaanFingerprints via
			// the identity map (F7).
			const { eligible, fingerprintByIdentity } = await prepareEligibleKhaanTransactions({
				getConsumedFingerprints: paymentQueries.store.getConsumedKhaanFingerprints.bind(
					paymentQueries.store,
				),
				paymentCreatedAtMs: payment.createdAt.getTime(),
				transactions,
			});
			return await collectMatchingKhaanFingerprints({
				eligible,
				expectedAmount: payment.amount,
				fingerprintByIdentity,
				paymentNumber,
				phone: String(payment.order.customerPhone),
			});
		} catch {
			// Khaan fetch/auth failure or payment lookup failure — do not block
			// the admin confirm. The caller logs and proceeds.
			return null;
		}
	}

	// khaan-client's reconcileTransfer async iterator is intentionally not used:
	// it cannot survive DO hibernation between alarms, so alarm-driven polling
	// reproduces its contract instead.
	async alarm(): Promise<void> {
		const state = await this.getStoredState();
		if (!state || state.status !== "polling") {
			return;
		}

		await this.poll(state);
	}

	private async poll(state: TransferReconciliationState) {
		const now = Date.now();
		if (now >= Date.parse(state.expiresAt)) {
			await this.writeState({
				...state,
				lastError: null,
				nextPollAt: null,
				status: "timeout",
			});
			return;
		}

		const attempts = state.attempts + 1;

		try {
			const payment = await paymentQueries.store.getPaymentInfoByNumber(state.paymentNumber);
			if (!payment) {
				await this.writeState({
					...state,
					attempts,
					lastError: "Payment not found",
					nextPollAt: null,
					status: "failed",
				});
				return;
			}
			if (payment.status === "success") {
				await this.writeState({
					...state,
					attempts,
					lastError: null,
					nextPollAt: null,
					status: "confirmed",
				});
				return;
			}
			if (payment.provider !== "transfer" || !isConfirmablePaymentStatus(payment.status)) {
				await this.writeState({
					...state,
					attempts,
					lastError: `Payment is not confirmable (${payment.provider}/${payment.status})`,
					nextPollAt: null,
					status: "failed",
				});
				return;
			}

			const client = await this.ensureClient();
			const transactions = await client.fetchTransactions();
			// Shared eligible pipeline (F3): window-filter → fingerprint →
			// consumed-lookup → eligible-filter in one pass. The identity→
			// fingerprint map is reused by confirmMatch to record the matched
			// transaction's fingerprint without recomputing SHA-256 (F7).
			const { eligible, fingerprintByIdentity } = await prepareEligibleKhaanTransactions({
				getConsumedFingerprints: paymentQueries.store.getConsumedKhaanFingerprints.bind(
					paymentQueries.store,
				),
				paymentCreatedAtMs: payment.createdAt.getTime(),
				transactions,
			});
			const matchResult = matchKhaanTransfer({
				expectedAmount: payment.amount,
				paymentNumber: state.paymentNumber,
				phone: String(payment.order.customerPhone),
				transactions: eligible,
			});

			if (matchResult.status === "none") {
				await this.scheduleNext({ ...state, attempts, lastError: null });
				return;
			}

			if (matchResult.status === "ambiguous") {
				await this.writeState({
					...state,
					attempts,
					lastError: null,
					matchedTransaction: matchResult.matches[0],
					nextPollAt: null,
					status: "ambiguous",
				});
				return;
			}

			await this.confirmMatch(state, attempts, matchResult.match, fingerprintByIdentity);
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			if (error instanceof KhaanAuthError) {
				this.client = null;
				await this.writeState({
					...state,
					attempts,
					lastError: errorMessage(failure),
					nextPollAt: null,
					status: "auth_required",
				});
				return;
			}
			await this.scheduleNext(
				{
					...state,
					attempts,
					lastError: errorMessage(failure),
				},
				retryDelayMs(failure),
			);
		}
	}

	private async confirmMatch(
		state: TransferReconciliationState,
		attempts: number,
		match: MatchedKhaanTransaction,
		fingerprintByIdentity: Map<string, string>,
	) {
		// F5: no pre-confirm "matched" write. Go straight from poll → confirm →
		// write the final status (confirmed/ambiguous/failed). The intermediate
		// "matched" state was not observable by any consumer that matters and
		// left a transient stuck-looking state if confirm threw a non-Khaan
		// error before the recovery path ran.
		const matchedFingerprint =
			fingerprintOf(fingerprintByIdentity, match) ?? (await khaanTransactionFingerprint(match));
		const confirmation = await confirmPaymentAndNotify({
			consumedKhaanTransactions: [{ fingerprint: matchedFingerprint }],
			paymentNumber: state.paymentNumber,
			provider: "transfer",
			source: "auto_reconciliation",
		});

		if (!confirmation.confirmed && confirmation.reason === "khaan_transaction_already_consumed") {
			await this.writeState({
				...state,
				attempts,
				lastError: confirmation.reason,
				matchedTransaction: match,
				nextPollAt: null,
				status: "ambiguous",
			});
			return;
		}

		const paymentAfterConfirmation = confirmation.confirmed
			? null
			: await paymentQueries.store.getPaymentInfoByNumber(state.paymentNumber);
		const reason = confirmation.confirmed ? null : confirmation.reason;
		const succeeded = confirmation.confirmed || paymentAfterConfirmation?.status === "success";
		await this.writeState({
			...state,
			attempts,
			lastError: succeeded ? null : reason,
			matchedTransaction: match,
			nextPollAt: null,
			status: succeeded ? "confirmed" : "failed",
		});
	}

	private async scheduleNext(state: TransferReconciliationState, delayMs = POLL_INTERVAL_MS) {
		const nextPollAt = Date.now() + delayMs;
		if (nextPollAt >= Date.parse(state.expiresAt)) {
			await this.writeState({
				...state,
				nextPollAt: null,
				status: "timeout",
			});
			return;
		}

		await this.writeState({
			...state,
			nextPollAt: new Date(nextPollAt).toISOString(),
			status: "polling",
		});
		await this.ctx.storage.setAlarm(nextPollAt);
	}

	private async getStoredState() {
		return (await this.ctx.storage.get<TransferReconciliationState>(STATE_KEY)) ?? null;
	}

	private async writeState(state: TransferReconciliationState) {
		await this.ctx.storage.put(STATE_KEY, state);
	}
}

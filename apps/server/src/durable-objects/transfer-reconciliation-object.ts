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

const errorMessage = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const retryDelayMs = (error: unknown) =>
	error instanceof KhaanRateLimitError
		? RATE_LIMIT_BACKOFF_MS
		: POLL_INTERVAL_MS;

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
			username: this.appEnv.KHAAN_USERNAME,
			password: this.appEnv.KHAAN_PASSWORD,
			deviceId: this.appEnv.KHAAN_DEVICE_ID,
			userAgent: this.appEnv.KHAAN_USER_AGENT,
			accountNumber: this.appEnv.KHAAN_ACCOUNT_NUMBER,
			branchCode: this.appEnv.KHAAN_BRANCH_CODE,
		});
		await client.login();
		this.client = client;
		return client;
	}

	async start(input: StartInput): Promise<TransferReconciliationState> {
		const current = await this.getStoredState();
		if (
			current?.paymentNumber === input.paymentNumber &&
			!terminalStatuses.has(current.status)
		) {
			return current;
		}

		const now = Date.now();
		const state: TransferReconciliationState = {
			paymentNumber: input.paymentNumber,
			status: "polling",
			attempts: 0,
			startedAt: new Date(now).toISOString(),
			expiresAt: new Date(now + MAX_POLL_MS).toISOString(),
			nextPollAt: new Date(now + 1000).toISOString(),
			lastError: null,
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
	async collectMatchingKhaanFingerprints(
		paymentNumber: string,
	): Promise<string[] | null> {
		try {
			const payment = await paymentQueries.store.getPaymentInfoByNumber(
				paymentNumber,
			);
			if (!payment || payment.provider !== "transfer") {
				return null;
			}
			const client = await this.ensureClient();
			const transactions = await client.fetchTransactions();
			// Shared eligible pipeline (F3): window-filter → fingerprint →
			// consumed-lookup → eligible-filter in one pass. Fingerprints are
			// computed once and reused by collectMatchingKhaanFingerprints via
			// the identity map (F7).
			const { eligible, fingerprintByIdentity } =
				await prepareEligibleKhaanTransactions({
					transactions,
					paymentCreatedAtMs: payment.createdAt.getTime(),
					getConsumedFingerprints:
						paymentQueries.store.getConsumedKhaanFingerprints.bind(
							paymentQueries.store,
						),
				});
			return await collectMatchingKhaanFingerprints({
				eligible,
				fingerprintByIdentity,
				paymentNumber,
				phone: String(payment.order.customerPhone),
				expectedAmount: payment.amount,
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
				status: "timeout",
				nextPollAt: null,
				lastError: null,
			});
			return;
		}

		const attempts = state.attempts + 1;

		try {
			const payment = await paymentQueries.store.getPaymentInfoByNumber(
				state.paymentNumber,
			);
			if (!payment) {
				await this.writeState({
					...state,
					status: "failed",
					attempts,
					nextPollAt: null,
					lastError: "Payment not found",
				});
				return;
			}
			if (payment.status === "success") {
				await this.writeState({
					...state,
					status: "confirmed",
					attempts,
					nextPollAt: null,
					lastError: null,
				});
				return;
			}
			if (
				payment.provider !== "transfer" ||
				!isConfirmablePaymentStatus(payment.status)
			) {
				await this.writeState({
					...state,
					status: "failed",
					attempts,
					nextPollAt: null,
					lastError: `Payment is not confirmable (${payment.provider}/${payment.status})`,
				});
				return;
			}

			const client = await this.ensureClient();
			const transactions = await client.fetchTransactions();
			// Shared eligible pipeline (F3): window-filter → fingerprint →
			// consumed-lookup → eligible-filter in one pass. The identity→
			// fingerprint map is reused by confirmMatch to record the matched
			// transaction's fingerprint without recomputing SHA-256 (F7).
			const { eligible, fingerprintByIdentity } =
				await prepareEligibleKhaanTransactions({
					transactions,
					paymentCreatedAtMs: payment.createdAt.getTime(),
					getConsumedFingerprints:
						paymentQueries.store.getConsumedKhaanFingerprints.bind(
							paymentQueries.store,
						),
				});
			const matchResult = matchKhaanTransfer({
				transactions: eligible,
				paymentNumber: state.paymentNumber,
				phone: String(payment.order.customerPhone),
				expectedAmount: payment.amount,
			});

			if (matchResult.status === "none") {
				await this.scheduleNext({ ...state, attempts, lastError: null });
				return;
			}

			if (matchResult.status === "ambiguous") {
				await this.writeState({
					...state,
					status: "ambiguous",
					attempts,
					nextPollAt: null,
					lastError: null,
					matchedTransaction: matchResult.matches[0],
				});
				return;
			}

			await this.confirmMatch(
				state,
				attempts,
				matchResult.match,
				fingerprintByIdentity,
			);
		} catch (error) {
			if (error instanceof KhaanAuthError) {
				this.client = null;
				await this.writeState({
					...state,
					status: "auth_required",
					attempts,
					nextPollAt: null,
					lastError: errorMessage(error),
				});
				return;
			}
			await this.scheduleNext(
				{
					...state,
					attempts,
					lastError: errorMessage(error),
				},
				retryDelayMs(error),
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
			fingerprintOf(fingerprintByIdentity, match) ??
			(await khaanTransactionFingerprint(match));
		const confirmation = await confirmPaymentAndNotify({
			paymentNumber: state.paymentNumber,
			provider: "transfer",
			source: "auto_reconciliation",
			consumedKhaanTransactions: [{ fingerprint: matchedFingerprint }],
		});

		if (
			!confirmation.confirmed &&
			confirmation.reason === "khaan_transaction_already_consumed"
		) {
			await this.writeState({
				...state,
				status: "ambiguous",
				attempts,
				nextPollAt: null,
				lastError: confirmation.reason,
				matchedTransaction: match,
			});
			return;
		}

		const paymentAfterConfirmation = confirmation.confirmed
			? null
			: await paymentQueries.store.getPaymentInfoByNumber(
					state.paymentNumber,
				);
		const reason = confirmation.confirmed ? null : confirmation.reason;
		const succeeded =
			confirmation.confirmed ||
			paymentAfterConfirmation?.status === "success";
		await this.writeState({
			...state,
			status: succeeded ? "confirmed" : "failed",
			attempts,
			nextPollAt: null,
			lastError: succeeded ? null : reason,
			matchedTransaction: match,
		});
	}

	private async scheduleNext(
		state: TransferReconciliationState,
		delayMs = POLL_INTERVAL_MS,
	) {
		const nextPollAt = Date.now() + delayMs;
		if (nextPollAt >= Date.parse(state.expiresAt)) {
			await this.writeState({
				...state,
				status: "timeout",
				nextPollAt: null,
			});
			return;
		}

		await this.writeState({
			...state,
			status: "polling",
			nextPollAt: new Date(nextPollAt).toISOString(),
		});
		await this.ctx.storage.setAlarm(nextPollAt);
	}

	private async getStoredState() {
		return (
			(await this.ctx.storage.get<TransferReconciliationState>(STATE_KEY)) ??
			null
		);
	}

	private async writeState(state: TransferReconciliationState) {
		await this.ctx.storage.put(STATE_KEY, state);
	}
}

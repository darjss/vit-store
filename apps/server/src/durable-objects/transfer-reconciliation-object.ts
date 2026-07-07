import { paymentQueries } from "@vit/api/queries";
import { confirmTransferPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { DurableObject } from "cloudflare:workers";
import {
	KhaanAuthError,
	KhaanClient,
	type MatchedKhaanTransaction,
	type TransferReconciliationStatus,
} from "khaan-client";
import { matchKhaanTransfer } from "../lib/khaan/match-transfer";

const STATE_KEY = "transfer-reconciliation:state:v1";
const POLL_INTERVAL_MS = 25_000;
const MAX_POLL_MS = 5 * 60_000;

export type TransferReconciliationState = {
	paymentNumber: string;
	status: TransferReconciliationStatus;
	attempts: number;
	startedAt: string;
	expiresAt: string;
	nextPollAt: string | null;
	lastError: string | null;
	matchedTransaction?: MatchedKhaanTransaction;
};

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
			const matchResult = matchKhaanTransfer({
				transactions,
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

			await this.writeState({
				...state,
				status: "matched",
				attempts,
				nextPollAt: null,
				lastError: null,
				matchedTransaction: matchResult.match,
			});

			const confirmation = await confirmTransferPaymentAndNotify({
				paymentNumber: state.paymentNumber,
				source: "auto_reconciliation",
			});
			const paymentAfterConfirmation = confirmation.confirmed
				? null
				: await paymentQueries.store.getPaymentInfoByNumber(
						state.paymentNumber,
					);
			await this.writeState({
				...state,
				status:
					confirmation.confirmed ||
					paymentAfterConfirmation?.status === "success"
						? "confirmed"
						: "failed",
				attempts,
				nextPollAt: null,
				lastError:
					confirmation.confirmed ||
					paymentAfterConfirmation?.status === "success"
						? null
						: confirmation.reason,
				matchedTransaction: matchResult.match,
			});
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
			await this.scheduleNext({
				...state,
				attempts,
				lastError: errorMessage(error),
			});
		}
	}

	private async scheduleNext(state: TransferReconciliationState) {
		const nextPollAt = Date.now() + POLL_INTERVAL_MS;
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

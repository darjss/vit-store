import { paymentQueries } from "@vit/api/queries";
import { confirmTransferPaymentAndNotify } from "@vit/api/lib/payments/transfer-confirmation";
import { DurableObject } from "cloudflare:workers";
import { KhaanClient } from "../lib/khaan/client";
import {
	type MatchedKhaanTransaction,
	type TransferReconciliationStatus,
	findMatchingKhaanTransfer,
} from "../lib/khaan/reconciliation";

const STATE_KEY = "transfer-reconciliation:state:v1";
const POLL_INTERVAL_MS = 25_000;
const MAX_POLL_MS = 5 * 60_000;
const LOOKBACK_MS = 10 * 60_000;

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

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.appEnv = env;
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

			const client = new KhaanClient({
				username: this.appEnv.KHAAN_USERNAME,
				password: this.appEnv.KHAAN_PASSWORD,
				deviceId: this.appEnv.KHAAN_DEVICE_ID,
				userAgent: this.appEnv.KHAAN_USER_AGENT,
				accountNumber: this.appEnv.KHAAN_ACCOUNT_NUMBER,
				branchCode: this.appEnv.KHAAN_BRANCH_CODE,
			});
			const login = await client.loginInitial();
			if (login.status === "mfa_required") {
				await this.writeState({
					...state,
					status: "auth_required",
					attempts,
					nextPollAt: null,
					lastError: "Khaan MFA required",
				});
				return;
			}
			if (login.status === "failed") {
				await this.scheduleNext({
					...state,
					attempts,
					lastError: login.error,
				});
				return;
			}

			const transactions = await client.fetchTransactions({
				accessToken: login.accessToken,
			});
			const matchResult = findMatchingKhaanTransfer({
				transactions,
				paymentNumber: state.paymentNumber,
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

import { matchAsync } from "dismatch/async";
import { and, eq, isNull } from "drizzle-orm";
import type { QpayInvoice } from "@vit/shared";
import { db } from "~/db/client";
import { PaymentsTable, QpayInvoicesTable } from "~/db/schema";

export type QpayInvoiceClaim =
	| { _tag: "Claimed"; claimToken: string }
	| { _tag: "Created"; response: QpayInvoice }
	| { _tag: "InProgress" }
	| { _tag: "Ambiguous" };

const QPAY_CREATE_AMBIGUITY_MS = 2 * 60_000;

const qpayStates = {
	creating: { _tag: "creating" },
	created: { _tag: "created" },
	rejected: { _tag: "rejected" },
	ambiguous: { _tag: "ambiguous" },
} as const;

export const qpayInvoiceQueries = {
	async get(paymentNumber: string) {
		return await db().query.QpayInvoicesTable.findFirst({
			where: eq(QpayInvoicesTable.paymentNumber, paymentNumber),
		});
	},

	async claim(paymentNumber: string): Promise<QpayInvoiceClaim> {
		const claimToken = crypto.randomUUID();
		const [inserted] = await db()
			.insert(QpayInvoicesTable)
			.values({
				paymentNumber,
				providerRequestId: paymentNumber,
				status: "creating",
				claimToken,
			})
			.onConflictDoNothing()
			.returning({ id: QpayInvoicesTable.id });
		if (inserted) return { _tag: "Claimed", claimToken };

		return await db().transaction(async (tx) => {
			const [current] = await tx
				.select({
					status: QpayInvoicesTable.status,
					response: QpayInvoicesTable.response,
					createdAt: QpayInvoicesTable.createdAt,
					updatedAt: QpayInvoicesTable.updatedAt,
				})
				.from(QpayInvoicesTable)
				.where(eq(QpayInvoicesTable.paymentNumber, paymentNumber))
				.for("update");
			if (!current) throw new Error("QPay invoice state disappeared.");
			return matchAsync(
				qpayStates[current.status],
				"_tag",
			)<QpayInvoiceClaim>({
				created: () => {
					if (!current.response) {
						throw new Error("Created QPay invoice response is missing.");
					}
					return { _tag: "Created", response: current.response };
				},
				creating: async () => {
					const stateUpdatedAt = current.updatedAt ?? current.createdAt;
					if (
						Date.now() - stateUpdatedAt.getTime() <
						QPAY_CREATE_AMBIGUITY_MS
					) {
						return { _tag: "InProgress" };
					}
					await tx
						.update(QpayInvoicesTable)
						.set({
							status: "ambiguous",
							lastErrorCode: "provider_outcome_unknown",
						})
						.where(eq(QpayInvoicesTable.paymentNumber, paymentNumber));
					return { _tag: "Ambiguous" };
				},
				ambiguous: () => ({ _tag: "Ambiguous" }),
				rejected: async () => {
					await tx
						.update(QpayInvoicesTable)
						.set({
							status: "creating",
							claimToken,
							lastErrorCode: null,
						})
						.where(eq(QpayInvoicesTable.paymentNumber, paymentNumber));
					return { _tag: "Claimed", claimToken };
				},
			});
		});
	},

	async complete(
		paymentNumber: string,
		claimToken: string,
		response: QpayInvoice,
	) {
		return await db().transaction(async (tx) => {
			const [completed] = await tx
				.update(QpayInvoicesTable)
				.set({
					status: "created",
					invoiceId: response.invoice_id,
					response,
					lastErrorCode: null,
				})
				.where(
					and(
						eq(QpayInvoicesTable.paymentNumber, paymentNumber),
						eq(QpayInvoicesTable.status, "creating"),
						eq(QpayInvoicesTable.claimToken, claimToken),
					),
				)
				.returning({ id: QpayInvoicesTable.id });
			if (!completed) return false;
			await tx
				.update(PaymentsTable)
				.set({ provider: "qpay", invoiceId: response.invoice_id })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						eq(PaymentsTable.status, "pending"),
						isNull(PaymentsTable.deletedAt),
					),
				);
			return true;
		});
	},

	async recordFailure(
		paymentNumber: string,
		claimToken: string,
		input: { ambiguous: boolean; code: string },
	) {
		await db()
			.update(QpayInvoicesTable)
			.set({
				status: input.ambiguous ? "ambiguous" : "rejected",
				lastErrorCode: input.code,
			})
			.where(
				and(
					eq(QpayInvoicesTable.paymentNumber, paymentNumber),
					eq(QpayInvoicesTable.status, "creating"),
					eq(QpayInvoicesTable.claimToken, claimToken),
				),
			);
	},

	async adopt(paymentNumber: string, response: QpayInvoice) {
		await db().transaction(async (tx) => {
			await tx
				.insert(QpayInvoicesTable)
				.values({
					paymentNumber,
					providerRequestId: paymentNumber,
					status: "created",
					claimToken: crypto.randomUUID(),
					invoiceId: response.invoice_id,
					response,
				})
				.onConflictDoUpdate({
					target: QpayInvoicesTable.paymentNumber,
					set: {
						status: "created",
						invoiceId: response.invoice_id,
						response,
						lastErrorCode: null,
					},
				});
			await tx
				.update(PaymentsTable)
				.set({ provider: "qpay", invoiceId: response.invoice_id })
				.where(
					and(
						eq(PaymentsTable.paymentNumber, paymentNumber),
						eq(PaymentsTable.status, "pending"),
						isNull(PaymentsTable.deletedAt),
					),
				);
		});
	},
};

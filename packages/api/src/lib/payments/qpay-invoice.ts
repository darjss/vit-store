import { qpayInvoiceSchema } from "@vit/shared";
import * as v from "valibot";
import { kv } from "~/lib/kv";
import {
	ensureQpayInvoiceWithDependencies,
	mapQpayCreateError,
} from "~/lib/payments/qpay-invoice-core";
import { createQpayInvoice } from "~/lib/payments/qpay";
import { paymentQueries } from "~/queries/payments";
import { qpayInvoiceQueries } from "~/queries/qpay-invoices";

const readCachedInvoice = async (paymentNumber: string) => {
	const cached = await kv()
		.get(`QPAY:${paymentNumber}`)
		.catch(() => null);
	if (!cached) return null;
	try {
		const parsed = v.safeParse(qpayInvoiceSchema, JSON.parse(cached) as unknown);
		return parsed.success ? parsed.output : null;
	} catch {
		return null;
	}
};

export { mapQpayCreateError };

export const ensureQpayInvoiceForPayment = async (paymentNumber: string) =>
	ensureQpayInvoiceWithDependencies(paymentNumber, {
		loadPayment: paymentQueries.store.getPaymentInfoByNumber,
		readCached: readCachedInvoice,
		cache: async (number, response) => {
			await kv().put(`QPAY:${number}`, JSON.stringify(response), {
				expirationTtl: 3600,
			});
		},
		get: qpayInvoiceQueries.get,
		claim: qpayInvoiceQueries.claim,
		adopt: qpayInvoiceQueries.adopt,
		create: createQpayInvoice,
		complete: qpayInvoiceQueries.complete,
		recordFailure: qpayInvoiceQueries.recordFailure,
	});

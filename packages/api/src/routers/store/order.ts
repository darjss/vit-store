import { TRPCError } from "@trpc/server";
import { orderQueries, paymentQueries } from "@vit/api/queries";
import { newOrderSchema } from "@vit/shared";
import { bankTransfer, deliveryFee } from "@vit/shared/constants";
import * as v from "valibot";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
	CustomersTable,
	OrderDetailsTable,
	OrdersTable,
	PaymentsTable,
	ProductsTable,
} from "~/db/schema";
import { cartFingerprint } from "~/lib/order/cart-fingerprint";
import {
	assertCanAccessOrder,
	createCheckoutAccessToken,
	type CustomerSessionClaims,
} from "~/lib/session/checkout-access";
import { getDeliveryAddressZones } from "~/lib/integrations/delivery";
import {
	trackOrderCreatedServerSide,
	trackQpayInvoiceCreatedServerSide,
} from "~/lib/integrations/posthog";
import { kv } from "~/lib/kv";
import { createQpayInvoice } from "~/lib/payments/qpay";
import { createSession, setSessionTokenCookie } from "~/lib/session/store";
import { publicProcedure, router, verifiedCustomerProcedure } from "~/lib/trpc";
import type { Context } from "~/lib/context";
import { generateOrderNumber, generatePaymentNumber } from "~/lib/utils";

type CartLine = { productId: number; quantity: number };
type CheckoutProduct = {
	id: number;
	name: string;
	price: number;
	status: string;
	stock: number;
};

function normalizeCartProducts(products: Array<{ productId: number; quantity: number }>) {
	const productsById = new Map<number, number>();
	for (const item of products) {
		const productId = Math.trunc(item.productId);
		const quantity = Math.trunc(item.quantity);
		if (productId <= 0 || quantity <= 0) {
			continue;
		}
		productsById.set(productId, (productsById.get(productId) ?? 0) + quantity);
	}
	return Array.from(productsById.entries()).map(([productId, quantity]) => ({
		productId,
		quantity,
	}));
}

async function prepareOrderCheckout(ctx: Context, normalizedProducts: Array<CartLine>) {
	if (normalizedProducts.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Сагс хоосон эсвэл буруу байна. Дахин оролдоно уу.",
		});
	}
	const productIds = normalizedProducts.map((product) => product.productId);
	const products = await ctx.db.query.ProductsTable.findMany({
		columns: { id: true, name: true, price: true, status: true, stock: true },
		where: inArray(ProductsTable.id, productIds),
	});
	const existingProductIds = new Set(products.map((product) => product.id));
	const missingProductIds = normalizedProducts
		.filter((product) => !existingProductIds.has(product.productId))
		.map((product) => product.productId);
	if (missingProductIds.length > 0) {
		ctx.log.warn("order.invalid_products", { missingProductIds });
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Зарим бараа олдсонгүй. Сагсаа шинэчлээд дахин оролдоно уу.",
		});
	}
	const productById = new Map<number, CheckoutProduct>(
		products.map((product) => [product.id, product]),
	);
	for (const item of normalizedProducts) {
		const product = productById.get(item.productId);
		if (!product || product.status !== "active" || product.stock < item.quantity) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${product?.name ?? "Бараа"} үлдэгдэл хүрэлцэхгүй байна.`,
			});
		}
	}
	const productsTotal = normalizedProducts.reduce((acc, item) => {
		return acc + (productById.get(item.productId)?.price ?? 0) * item.quantity;
	}, 0);
	return { productById, total: productsTotal + deliveryFee };
}

type CheckoutTx = Parameters<Parameters<Context["db"]["transaction"]>[0]>[0];

async function upsertCheckoutCustomer(
	tx: CheckoutTx,
	input: v.InferOutput<typeof newOrderSchema>,
	customerPhone: number,
) {
	const existingCustomer = await tx.query.CustomersTable.findFirst({
		where: eq(CustomersTable.phone, customerPhone),
	});
	const [customer] = existingCustomer
		? await tx
				.update(CustomersTable)
				.set({
					address: input.address,
					...(input.addressZoneId !== undefined && { addressZoneId: input.addressZoneId }),
				})
				.where(eq(CustomersTable.phone, customerPhone))
				.returning()
		: await tx
				.insert(CustomersTable)
				.values({
					address: input.address,
					addressZoneId: input.addressZoneId ?? null,
					phone: customerPhone,
				})
				.returning();
	if (!customer) {
		throw new Error("No customer returned");
	}
	return customer;
}

async function loadPendingCheckout(tx: CheckoutTx, customerPhone: number) {
	const pendingOrder = await tx.query.OrdersTable.findFirst({
		orderBy: desc(OrdersTable.createdAt),
		where: and(
			eq(OrdersTable.customerPhone, customerPhone),
			eq(OrdersTable.status, "created"),
			isNull(OrdersTable.deletedAt),
		),
		with: {
			orderDetails: {
				columns: { productId: true, quantity: true },
				where: isNull(OrderDetailsTable.deletedAt),
			},
			payments: {
				columns: { amount: true, paymentNumber: true, status: true },
				orderBy: desc(PaymentsTable.createdAt),
				where: isNull(PaymentsTable.deletedAt),
			},
		},
	});
	const openPayment = pendingOrder?.payments.find(
		(payment) =>
			(payment.status === "pending" || payment.status === "customer_claimed_paid") &&
			payment.paymentNumber,
	);
	return { openPayment, pendingOrder };
}

async function reuseMatchingCheckout(
	tx: CheckoutTx,
	input: v.InferOutput<typeof newOrderSchema>,
	customer: Awaited<ReturnType<typeof upsertCheckoutCustomer>>,
	pendingOrder: NonNullable<Awaited<ReturnType<typeof loadPendingCheckout>>["pendingOrder"]>,
	openPayment: NonNullable<Awaited<ReturnType<typeof loadPendingCheckout>>["openPayment"]>,
	submittedFingerprint: string,
) {
	await tx
		.update(OrdersTable)
		.set({
			address: input.address,
			addressZoneId: input.addressZoneId ?? pendingOrder.addressZoneId,
			notes: input.notes ?? null,
		})
		.where(eq(OrdersTable.id, pendingOrder.id));
	return {
		customer,
		orderId: pendingOrder.id,
		orderNumber: pendingOrder.orderNumber,
		paymentNumber: openPayment.paymentNumber,
		reused: true as const,
		total: openPayment.amount ?? pendingOrder.total,
	};
}

async function cancelStalePendingCheckout(
	ctx: Context,
	tx: CheckoutTx,
	customerPhone: number,
	pendingOrder: NonNullable<Awaited<ReturnType<typeof loadPendingCheckout>>["pendingOrder"]>,
	openPayment: NonNullable<Awaited<ReturnType<typeof loadPendingCheckout>>["openPayment"]>,
) {
	const [failedPayment] = await tx
		.update(PaymentsTable)
		.set({ status: "failed" })
		.where(
			and(
				eq(PaymentsTable.paymentNumber, openPayment.paymentNumber),
				eq(PaymentsTable.status, "pending"),
				isNull(PaymentsTable.deletedAt),
			),
		)
		.returning({ paymentNumber: PaymentsTable.paymentNumber });
	if (!failedPayment) {
		return;
	}
	await tx
		.update(OrdersTable)
		.set({ status: "cancelled" })
		.where(
			and(
				eq(OrdersTable.id, pendingOrder.id),
				eq(OrdersTable.status, "created"),
				isNull(OrdersTable.deletedAt),
			),
		);
	ctx.log.info("order.prior_unpaid_cancelled", {
		customerPhone,
		orderId: pendingOrder.id,
		orderNumber: pendingOrder.orderNumber,
		paymentNumber: openPayment.paymentNumber,
	});
}

async function insertFreshCheckout(
	tx: CheckoutTx,
	input: v.InferOutput<typeof newOrderSchema>,
	params: {
		customer: Awaited<ReturnType<typeof upsertCheckoutCustomer>>;
		customerPhone: number;
		normalizedProducts: Array<CartLine>;
		orderNumber: string;
		paymentNumberGenerated: string;
		productById: Map<number, CheckoutProduct>;
		provider: "qpay" | "transfer";
		total: number;
	},
) {
	const [createdOrder] = await tx
		.insert(OrdersTable)
		.values({
			address: input.address,
			addressZoneId: input.addressZoneId ?? null,
			customerPhone: params.customerPhone,
			deliveryProvider: "tu-delivery",
			notes: input.notes ?? null,
			orderNumber: params.orderNumber,
			status: "created",
			total: params.total,
		})
		.returning({ orderId: OrdersTable.id });
	if (!createdOrder) {
		throw new Error("No order ID returned");
	}
	await tx.insert(OrderDetailsTable).values(
		params.normalizedProducts.map((product) => ({
			orderId: createdOrder.orderId,
			price: params.productById.get(product.productId)?.price ?? null,
			productId: product.productId,
			quantity: product.quantity,
		})),
	);
	const [payment] = await tx
		.insert(PaymentsTable)
		.values({
			amount: params.total,
			orderId: createdOrder.orderId,
			paymentNumber: params.paymentNumberGenerated,
			provider: params.provider,
			status: "pending",
		})
		.returning({ paymentNumber: PaymentsTable.paymentNumber });
	return {
		customer: params.customer,
		orderId: createdOrder.orderId,
		orderNumber: params.orderNumber,
		paymentNumber: payment?.paymentNumber ?? null,
		reused: false as const,
		total: params.total,
	};
}

async function executeCheckoutTransaction(
	ctx: Context,
	input: v.InferOutput<typeof newOrderSchema>,
	params: {
		customerPhone: number;
		normalizedProducts: Array<CartLine>;
		orderNumber: string;
		paymentNumberGenerated: string;
		productById: Map<number, CheckoutProduct>;
		provider: "qpay" | "transfer";
		submittedFingerprint: string;
		total: number;
	},
) {
	return ctx.db.transaction(async (tx) => {
		const customer = await upsertCheckoutCustomer(tx, input, params.customerPhone);
		const { openPayment, pendingOrder } = await loadPendingCheckout(tx, params.customerPhone);
		if (
			pendingOrder &&
			openPayment &&
			cartFingerprint(pendingOrder.orderDetails) === params.submittedFingerprint
		) {
			return reuseMatchingCheckout(
				tx,
				input,
				customer,
				pendingOrder,
				openPayment,
				params.submittedFingerprint,
			);
		}
		if (
			pendingOrder &&
			openPayment &&
			openPayment.status === "pending" &&
			openPayment.paymentNumber
		) {
			await cancelStalePendingCheckout(ctx, tx, params.customerPhone, pendingOrder, openPayment);
		}
		return insertFreshCheckout(tx, input, { ...params, customer });
	});
}

function logCheckoutOutcome(
	ctx: Context,
	input: v.InferOutput<typeof newOrderSchema>,
	txResult: Awaited<ReturnType<typeof executeCheckoutTransaction>>,
	normalizedProducts: Array<CartLine>,
	total: number,
	provider: "qpay" | "transfer",
) {
	const { orderId, paymentNumber, reused } = txResult;
	if (reused) {
		ctx.log.info("order.checkout_reused", {
			customerPhone: Number(input.phoneNumber),
			itemCount: normalizedProducts.length,
			orderId,
			orderNumber: txResult.orderNumber,
			total,
		});
		return;
	}
	ctx.log.info("order.created", {
		customerPhone: Number(input.phoneNumber),
		itemCount: normalizedProducts.length,
		orderId,
		orderNumber: txResult.orderNumber,
		status_text: "created",
		total,
	});
	if (paymentNumber) {
		ctx.log.info("payment.created", {
			amount: total,
			orderId,
			paymentNumber,
			provider,
			status_text: "pending",
		});
	}
}

/**
 * Pre-create the QPay invoice so the QR is ready in KV before the user
 * reaches the payment page. `createQr` is the fallback when this misses
 * (invoice expired, pre-create failed, >1h delay). The issued invoice is
 * stored without changing the provider because this work is speculative.
 */
async function precreateQpayInvoice(paymentNumber: string): Promise<void> {
	const payment = await paymentQueries.store.getPaymentInfoByNumber(paymentNumber);
	if (!payment || payment.status === "success") {
		return;
	}
	const isDev = process.env.NODE_ENV === "development";
	const qpayResponse = await createQpayInvoice(
		isDev ? Math.ceil(payment.amount / 10_000) : payment.amount,
		paymentNumber,
	);
	await paymentQueries.store.storeQpayInvoice(paymentNumber, qpayResponse.invoice_id);
	await kv().put(`QPAY:${paymentNumber}`, JSON.stringify(qpayResponse), {
		expirationTtl: 3600,
	});
	trackQpayInvoiceCreatedServerSide({
		paymentNumber,
		phone: payment.order.customerPhone?.toString() ?? paymentNumber,
	}).catch(() => {});
}

/** Facebook iOS webviews often fail bank-app handoff, so those Payments start on transfer. Everyone else starts on QPay. Chosen once at insert. */
function initialPaymentProvider(userAgent: string | undefined) {
	const ua = userAgent ?? "";
	const facebookIos = /FB_IAB|FBAN\/FBIOS/.test(ua) && /iPhone|iPad|iPod/.test(ua);
	return facebookIos ? ("transfer" as const) : ("qpay" as const);
}

export const order = router({
	addOrder: publicProcedure.input(newOrderSchema).mutation(async ({ ctx, input }) => {
		const startTime = performance.now();
		try {
			const normalizedProducts = normalizeCartProducts(input.products);
			const { productById, total } = await prepareOrderCheckout(ctx, normalizedProducts);
			const orderNumber = generateOrderNumber();
			const paymentNumberGenerated = generatePaymentNumber();
			const customerPhone = Number(input.phoneNumber);
			const submittedFingerprint = cartFingerprint(normalizedProducts);
			const provider = initialPaymentProvider(ctx.c.req.header("user-agent"));
			const txResult = await executeCheckoutTransaction(ctx, input, {
				customerPhone,
				normalizedProducts,
				orderNumber,
				paymentNumberGenerated,
				productById,
				provider,
				submittedFingerprint,
				total,
			});
			const orderId = txResult.orderId;
			const reused = txResult.reused;
			const resolvedOrderNumber = txResult.orderNumber;
			const paymentNumber = txResult.paymentNumber;
			logCheckoutOutcome(ctx, input, txResult, normalizedProducts, total, provider);

			// Keep speculative QPay invoice creation alive after the response.
			// Failure is non-fatal — createQr is the fallback.
			if (paymentNumber && !reused) {
				ctx.c.executionCtx.waitUntil(
					precreateQpayInvoice(paymentNumber).catch((error) => {
						ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
							event: "qpay.invoice_precreate_failed",
							paymentNumber,
						});
					}),
				);
			}

			// Fire-and-forget server-side PostHog tracking
			if (!reused) {
				trackOrderCreatedServerSide({
					itemCount: normalizedProducts.length,
					orderNumber: resolvedOrderNumber,
					paymentNumber: paymentNumber ?? undefined,
					phone: input.phoneNumber,
					referrer: ctx.c.req.header("referer") ?? undefined,
					total,
				}).catch(() => {});
			}

			const checkoutToken = paymentNumber
				? await createCheckoutAccessToken(ctx, {
						orderId,
						orderNumber: resolvedOrderNumber,
						paymentNumber,
						phone: Number(input.phoneNumber),
					})
				: null;
			const checkoutGuestUser = {
				...txResult.customer,
				checkout: paymentNumber
					? { orderId, orderNumber: resolvedOrderNumber, paymentNumber }
					: undefined,
				trust: "checkout_guest" as const,
			} satisfies typeof txResult.customer & CustomerSessionClaims;
			const { session, token } = await createSession(checkoutGuestUser, kv());
			setSessionTokenCookie(ctx.c, token, session.expiresAt);
			const durationMs = performance.now() - startTime;
			ctx.log.info("auth.session_created", {
				phone: Number(input.phoneNumber),
				sessionId: session.id,
			});
			ctx.log.info("order.flow_complete", {
				durationMs,
				orderId,
				orderNumber: resolvedOrderNumber,
				paymentNumber,
				reused,
			});

			// F9/H5: return the full PaymentOptions props so the client does not
			// need a second getPaymentByNumber round-trip after addOrder.
			return {
				accountName: ctx.c.env.KHAAN_ACCOUNT_NAME || bankTransfer.accountName,
				accountNumber: ctx.c.env.KHAAN_ACCOUNT_NUMBER || bankTransfer.accountNumber,
				checkoutToken,
				customerPhone: input.phoneNumber,
				orderNumber: resolvedOrderNumber,
				paymentNumber,
				total: resolvedTotal,
			};
		} catch (error) {
			if (error instanceof TRPCError) {
				throw error;
			}
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "order.add_failed",
			});
			throw new TRPCError({
				cause: error,
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to add order",
			});
		}
	}),
	getDeliveryAddressZones: publicProcedure.query(async ({ ctx }) => {
		try {
			return await getDeliveryAddressZones();
		} catch (error) {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "order.fetch_zones_failed",
			});
			throw new TRPCError({
				cause: error,
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch delivery zones",
			});
		}
	}),
	getOrderByOrderNumber: publicProcedure
		.input(v.object({ checkoutToken: v.optional(v.string()), orderNumber: v.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const order = await assertCanAccessOrder(ctx, input.orderNumber, input.checkoutToken);
				ctx.log.info("order.viewed", { orderNumber: input.orderNumber });
				return order;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
					event: "order.fetch_by_number_failed",
					orderNumber: input.orderNumber,
				});
				throw new TRPCError({
					cause: error,
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to fetch order",
				});
			}
		}),
	getOrdersByCustomerId: verifiedCustomerProcedure.query(async ({ ctx }) => {
		try {
			const q = orderQueries.store;
			const customerPhone = ctx.session.user.phone;
			const orders = await q.getOrdersByCustomerPhone(customerPhone);
			ctx.log.info("order.viewed", {
				customerPhone,
				itemCount: orders.length,
			});
			return orders.map((order) => {
				const { orderDetails, payments, sales, ...orderInfo } = order;
				const salesPriceMap = new Map<number, number>();
				for (const sale of sales) {
					salesPriceMap.set(sale.productId, sale.sellingPrice);
				}
				const products = orderDetails.map((detail) => ({
					brandName: detail.product.brand.name,
					imageUrl: detail.product.images[0]?.url,
					name: detail.product.name,
					quantity: detail.quantity,
					sellingPrice: salesPriceMap.get(detail.productId) ?? 0,
				}));
				const latestPayment = payments[0];
				return {
					...orderInfo,
					paymentNumber: latestPayment?.paymentNumber ?? null,
					paymentProvider: latestPayment?.provider ?? null,
					paymentStatus: latestPayment?.status ?? null,
					products,
				};
			});
		} catch (error) {
			ctx.log.error(error instanceof Error ? error : new Error(String(error)), {
				event: "order.fetch_failed",
			});
			throw new TRPCError({
				cause: error,
				code: "INTERNAL_SERVER_ERROR",
				message: "Failed to fetch orders",
			});
		}
	}),
});

import { createTRPCClient, httpLink } from "@trpc/client";
import type { BotRouter } from "@vit/api";
import { SuperJSON } from "superjson";
import { bindInput, bindVoid, type CodemodeFn } from "./codemode-boundary";
import {
	addBrandSchema,
	addCategorySchema,
	addOrderSchema,
	addProductSchema,
	addPurchaseSchema,
	addProductImageInputSchema,
	addUserInputSchema,
	batchCreateProductsInputSchema,
	createPaymentInputSchema,
	extractProductQueryInputSchema,
	extractPurchaseFromImagesSchema,
	getAverageCostOfProductInputSchema,
	getPaginatedOrdersInputSchema,
	getPaginatedProductsInputSchema,
	getRecentOrdersByProductIdInputSchema,
	idInputSchema,
	listPurchasesSchema,
	markPurchaseForwarderReceivedInputSchema,
	markPurchaseShippedInputSchema,
	matchExtractedInvoiceInputSchema,
	mostViewedProductsInputSchema,
	orderCountInputSchema,
	paymentNumberInputSchema,
	phoneInputSchema,
	positiveIdInputSchema,
	productBehaviorInputSchema,
	productImageIdInputSchema,
	productImageUrlInputSchema,
	productImagesByProductIdInputSchema,
	queryInputSchema,
	receivePurchaseSchema,
	regenerateProductImagesInputSchema,
	saveExtractedPurchaseSchema,
	searchOrderQuickInputSchema,
	searchProductsInstantInputSchema,
	searchTermInputSchema,
	sessionIdInputSchema,
	setPrimaryProductImageInputSchema,
	setProductStockInputSchema,
	shipOrderInputSchema,
	timeRangeInputSchema,
	topProductsInputSchema,
	topSearchesInputSchema,
	updateCustomerInputSchema,
	updateOrderSchema,
	updateOrderStatusInputSchema,
	updateProductFieldInputSchema,
	updateProductImagesInputSchema,
	updateProductSchema,
	updatePurchaseInputSchema,
	updateStockInputSchema,
	uploadImagesFromUrlInputSchema,
} from "./read-fns-schemas";

// A Codemode ResolvedProvider: fns exposed under `name.*` inside the sandbox.
// The LLM calls `order.getPendingOrders()`, `product.searchProducts()`, etc.
interface ResolvedProvider {
	fns: Record<string, CodemodeFn>;
	name: string;
	prelude?: string;
}

// Builds the full fn registry for the Codemode sandbox, grouped by namespace.
// Each fn is a thin wrapper over a typed tRPC client targeting the bot-facing
// /trpc/bot endpoint, authed by the shared X-Admin-Bot-Token header.
//
// The fns mirror every business-data procedure on BotRouter. Query fns take
// the same input as the tRPC procedure; mutation fns take the same input and
// return the same result. The LLM writes code like:
//   const orders = await order.getPendingOrders();
//   const product = await product.getProductById({ id: 42 });
//   await product.updateStock({ productId: 42, numberToUpdate: 10, type: "add" });
export function buildReadFns({
	botToken,
	storeApiUrl,
}: {
	botToken: string;
	storeApiUrl: string;
}): Array<ResolvedProvider> {
	const url = `${storeApiUrl.replace(/\/+$/, "")}/trpc/bot`;
	const botClient = createTRPCClient<BotRouter>({
		links: [
			httpLink({
				headers: () => ({ "X-Admin-Bot-Token": botToken }),
				transformer: SuperJSON,
				url,
			}),
		],
	});

	return [
		{
			fns: {
				addOrder: bindInput(addOrderSchema, (input) => botClient.order.addOrder.mutate(input)),
				deleteOrder: bindInput(idInputSchema, (input) => botClient.order.deleteOrder.mutate(input)),
				getAllOrders: bindVoid(() => botClient.order.getAllOrders.query()),
				getOrderById: bindInput(idInputSchema, (input) =>
					botClient.order.getOrderById.query(input),
				),
				getOrderCount: bindInput(orderCountInputSchema, (input) =>
					botClient.order.getOrderCount.query(input),
				),
				getPaginatedOrders: bindInput(getPaginatedOrdersInputSchema, (input) =>
					botClient.order.getPaginatedOrders.query(input),
				),
				getPendingOrders: bindVoid(() => botClient.order.getPendingOrders.query()),
				getRecentOrdersByProductId: bindInput(getRecentOrdersByProductIdInputSchema, (input) =>
					botClient.order.getRecentOrdersByProductId.query(input),
				),
				restoreOrder: bindInput(idInputSchema, (input) =>
					botClient.order.restoreOrder.mutate(input),
				),
				searchOrder: bindInput(searchTermInputSchema, (input) =>
					botClient.order.searchOrder.mutate(input),
				),
				searchOrderQuick: bindInput(searchOrderQuickInputSchema, (input) =>
					botClient.order.searchOrderQuick.query(input),
				),
				shipOrder: bindInput(shipOrderInputSchema, (input) =>
					botClient.order.shipOrder.mutate(input),
				),
				updateOrder: bindInput(updateOrderSchema, (input) =>
					botClient.order.updateOrder.mutate(input),
				),
				updateOrderStatus: bindInput(updateOrderStatusInputSchema, (input) =>
					botClient.order.updateOrderStatus.mutate(input),
				),
			},
			name: "order",
		},
		{
			fns: {
				addProduct: bindInput(addProductSchema, (input) =>
					botClient.product.addProduct.mutate(input),
				),
				deleteProduct: bindInput(idInputSchema, (input) =>
					botClient.product.deleteProduct.mutate(input),
				),
				getAllProducts: bindVoid(() => botClient.product.getAllProducts.query()),
				getAllProductValue: bindVoid(() => botClient.product.getAllProductValue.query()),
				getPaginatedProducts: bindInput(getPaginatedProductsInputSchema, (input) =>
					botClient.product.getPaginatedProducts.query(input),
				),
				getProductById: bindInput(idInputSchema, (input) =>
					botClient.product.getProductById.query(input),
				),
				getReviewProducts: bindVoid(() => botClient.product.getReviewProducts.query()),
				searchProductByName: bindInput(searchTermInputSchema, (input) =>
					botClient.product.searchProductByName.query(input),
				),
				searchProductsInstant: bindInput(searchProductsInstantInputSchema, (input) =>
					botClient.product.searchProductsInstant.query(input),
				),
				setProductStock: bindInput(setProductStockInputSchema, (input) =>
					botClient.product.setProductStock.mutate(input),
				),
				updateProduct: bindInput(updateProductSchema, (input) =>
					botClient.product.updateProduct.mutate(input),
				),
				updateProductField: bindInput(updateProductFieldInputSchema, (input) =>
					botClient.product.updateProductField.mutate(input),
				),
				updateStock: bindInput(updateStockInputSchema, (input) =>
					botClient.product.updateStock.mutate(input),
				),
			},
			name: "product",
		},
		{
			fns: {
				addUser: bindInput(addUserInputSchema, (input) => botClient.customer.addUser.mutate(input)),
				deleteCustomer: bindInput(phoneInputSchema, (input) =>
					botClient.customer.deleteCustomer.mutate(input),
				),
				getAllCustomers: bindVoid(() => botClient.customer.getAllCustomers.query()),
				getCustomerByPhone: bindInput(phoneInputSchema, (input) =>
					botClient.customer.getCustomerByPhone.query(input),
				),
				getCustomerCount: bindVoid(() => botClient.customer.getCustomerCount.query()),
				getNewCustomersCount: bindInput(timeRangeInputSchema, (input) =>
					botClient.customer.getNewCustomersCount.query(input),
				),
				updateCustomer: bindInput(updateCustomerInputSchema, (input) =>
					botClient.customer.updateCustomer.mutate(input),
				),
			},
			name: "customer",
		},
		{
			fns: {
				confirmTransferPayment: bindInput(paymentNumberInputSchema, (input) =>
					botClient.payment.confirmTransferPayment.mutate(input),
				),
				createPayment: bindInput(createPaymentInputSchema, (input) =>
					botClient.payment.createPayment.mutate(input),
				),
				getClaimedTransferCount: bindVoid(() => botClient.payment.getClaimedTransferCount.query()),
				getClaimedTransferPayments: bindVoid(() =>
					botClient.payment.getClaimedTransferPayments.query(),
				),
				getPayments: bindVoid(() => botClient.payment.getPayments.query()),
				getPendingMessengerNotifications: bindVoid(() =>
					botClient.payment.getPendingMessengerNotifications.query(),
				),
				getPendingPayments: bindVoid(() => botClient.payment.getPendingPayments.query()),
				rejectTransferPayment: bindInput(paymentNumberInputSchema, (input) =>
					botClient.payment.rejectTransferPayment.mutate(input),
				),
			},
			name: "payment",
		},
		{
			fns: {
				analytics: bindVoid(() => botClient.sales.analytics.query()),
				avgOrderValue: bindInput(timeRangeInputSchema, (input) =>
					botClient.sales.avgOrderValue.query(input),
				),
				dashboard: bindVoid(() => botClient.sales.dashboard.query()),
				orderCount: bindInput(timeRangeInputSchema, (input) =>
					botClient.sales.orderCount.query(input),
				),
				pendingOrders: bindVoid(() => botClient.sales.pendingOrders.query()),
				topProducts: bindInput(topProductsInputSchema, (input) =>
					botClient.sales.topProducts.query(input),
				),
				weeklyOrders: bindVoid(() => botClient.sales.weeklyOrders.query()),
			},
			name: "sales",
		},
		{
			fns: {
				getAnalyticsData: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getAnalyticsData.query(input),
				),
				getAverageOrderValue: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getAverageOrderValue.query(input),
				),
				getConversionFunnel: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getConversionFunnel.query(input),
				),
				getCurrentProductsValue: bindVoid(() =>
					botClient.analytics.getCurrentProductsValue.query(),
				),
				getCustomerLifetimeValue: bindVoid(() =>
					botClient.analytics.getCustomerLifetimeValue.query(),
				),
				getDailyVisitorTrend: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getDailyVisitorTrend.query(input),
				),
				getFailedPayments: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getFailedPayments.query(input),
				),
				getHomePageData: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getHomePageData.query(input),
				),
				getInventoryStatus: bindVoid(() => botClient.analytics.getInventoryStatus.query()),
				getLowInventoryProducts: bindVoid(() =>
					botClient.analytics.getLowInventoryProducts.query(),
				),
				getMostViewedProducts: bindInput(mostViewedProductsInputSchema, (input) =>
					botClient.analytics.getMostViewedProducts.query(input),
				),
				getProductBehavior: bindInput(productBehaviorInputSchema, (input) =>
					botClient.analytics.getProductBehavior.query(input),
				),
				getRepeatCustomersCount: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getRepeatCustomersCount.query(input),
				),
				getSalesByCategory: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getSalesByCategory.query(input),
				),
				getTopBrandsBySales: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getTopBrandsBySales.query(input),
				),
				getTopSearches: bindInput(topSearchesInputSchema, (input) =>
					botClient.analytics.getTopSearches.query(input),
				),
				getTotalProfit: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getTotalProfit.query(input),
				),
				getWebAnalytics: bindInput(timeRangeInputSchema, (input) =>
					botClient.analytics.getWebAnalytics.query(input),
				),
			},
			name: "analytics",
		},
		{
			fns: {
				addPurchase: bindInput(addPurchaseSchema, (input) =>
					botClient.purchase.addPurchase.mutate(input),
				),
				cancelPurchase: bindInput(positiveIdInputSchema, (input) =>
					botClient.purchase.cancelPurchase.mutate(input),
				),
				deletePurchase: bindInput(positiveIdInputSchema, (input) =>
					botClient.purchase.deletePurchase.mutate(input),
				),
				getAllPurchases: bindVoid(() => botClient.purchase.getAllPurchases.query()),
				getAverageCostOfProduct: bindInput(getAverageCostOfProductInputSchema, (input) =>
					botClient.purchase.getAverageCostOfProduct.query(input),
				),
				getPaginatedPurchases: bindInput(listPurchasesSchema, (input) =>
					botClient.purchase.getPaginatedPurchases.query(input),
				),
				getPurchaseById: bindInput(positiveIdInputSchema, (input) =>
					botClient.purchase.getPurchaseById.query(input),
				),
				markPurchaseForwarderReceived: bindInput(
					markPurchaseForwarderReceivedInputSchema,
					(input) => botClient.purchase.markPurchaseForwarderReceived.mutate(input),
				),
				markPurchaseShipped: bindInput(markPurchaseShippedInputSchema, (input) =>
					botClient.purchase.markPurchaseShipped.mutate(input),
				),
				receivePurchase: bindInput(receivePurchaseSchema, (input) =>
					botClient.purchase.receivePurchase.mutate(input),
				),
				searchPurchases: bindInput(queryInputSchema, (input) =>
					botClient.purchase.searchPurchases.query(input),
				),
				updatePurchase: bindInput(updatePurchaseInputSchema, (input) =>
					botClient.purchase.updatePurchase.mutate(input),
				),
			},
			name: "purchase",
		},
		{
			fns: {
				addBrand: bindInput(addBrandSchema, (input) => botClient.brands.addBrand.mutate(input)),
				deleteBrand: bindInput(idInputSchema, (input) =>
					botClient.brands.deleteBrand.mutate(input),
				),
				getAllBrands: bindVoid(() => botClient.brands.getAllBrands.query()),
				updateBrand: bindInput(addBrandSchema, (input) =>
					botClient.brands.updateBrand.mutate(input),
				),
			},
			name: "brand",
		},
		{
			fns: {
				addCategory: bindInput(addCategorySchema, (input) =>
					botClient.category.addCategory.mutate(input),
				),
				deleteCategory: bindInput(positiveIdInputSchema, (input) =>
					botClient.category.deleteCategory.mutate(input),
				),
				getAllCategories: bindVoid(() => botClient.category.getAllCategories.query()),
				getCategoryById: bindInput(positiveIdInputSchema, (input) =>
					botClient.category.getCategoryById.query(input),
				),
				updateCategory: bindInput(addCategorySchema, (input) =>
					botClient.category.updateCategory.mutate(input),
				),
			},
			name: "category",
		},
		{
			fns: {
				addImage: bindInput(productImageUrlInputSchema, (input) =>
					botClient.image.addImage.mutate(input),
				),
				deleteImage: bindInput(productImageIdInputSchema, (input) =>
					botClient.image.deleteImage.mutate(input),
				),
				setPrimaryImage: bindInput(setPrimaryProductImageInputSchema, (input) =>
					botClient.image.setPrimaryImage.mutate(input),
				),
			},
			name: "image",
		},
		{
			fns: {
				addImage: bindInput(addProductImageInputSchema, (input) =>
					botClient.productImages.addImage.mutate(input),
				),
				deleteImage: bindInput(productImageIdInputSchema, (input) =>
					botClient.productImages.deleteImage.mutate(input),
				),
				getAllImages: bindVoid(() => botClient.productImages.getAllImages.query()),
				getImagesByProductId: bindInput(productImagesByProductIdInputSchema, (input) =>
					botClient.productImages.getImagesByProductId.query(input),
				),
				setPrimaryImage: bindInput(setPrimaryProductImageInputSchema, (input) =>
					botClient.productImages.setPrimaryImage.mutate(input),
				),
				updateImage: bindInput(updateProductImagesInputSchema, (input) =>
					botClient.productImages.updateImage.mutate(input),
				),
				uploadImagesFromUrl: bindInput(uploadImagesFromUrlInputSchema, (input) =>
					botClient.productImages.uploadImagesFromUrl.mutate(input),
				),
			},
			name: "productImage",
		},
		{
			fns: {
				batchCreateProducts: bindInput(batchCreateProductsInputSchema, (input) =>
					botClient.aiProduct.batchCreateProducts.mutate(input),
				),
				extractProduct: bindInput(extractProductQueryInputSchema, (input) =>
					botClient.aiProduct.extractProduct.mutate(input),
				),
				finalizeExtraction: bindInput(sessionIdInputSchema, (input) =>
					botClient.aiProduct.finalizeExtraction.mutate(input),
				),
				regenerateProductImages: bindInput(regenerateProductImagesInputSchema, (input) =>
					botClient.aiProduct.regenerateProductImages.mutate(input),
				),
				scrapeAndAnalyze: bindInput(sessionIdInputSchema, (input) =>
					botClient.aiProduct.scrapeAndAnalyze.mutate(input),
				),
				startExtraction: bindInput(extractProductQueryInputSchema, (input) =>
					botClient.aiProduct.startExtraction.mutate(input),
				),
				translateProduct: bindInput(sessionIdInputSchema, (input) =>
					botClient.aiProduct.translateProduct.mutate(input),
				),
			},
			name: "aiProduct",
		},
		{
			fns: {
				extractPurchaseFromImages: bindInput(extractPurchaseFromImagesSchema, (input) =>
					botClient.aiPurchase.extractPurchaseFromImages.mutate(input),
				),
				matchExtractedInvoice: bindInput(matchExtractedInvoiceInputSchema, (input) =>
					botClient.aiPurchase.matchExtractedInvoice.mutate(input),
				),
				saveExtractedPurchase: bindInput(saveExtractedPurchaseSchema, (input) =>
					botClient.aiPurchase.saveExtractedPurchase.mutate(input),
				),
			},
			name: "aiPurchase",
		},
	];
}

import { createTRPCClient, httpLink } from "@trpc/client";
import type { BotRouter } from "@vit/api";
import { SuperJSON } from "superjson";

// A Codemode ResolvedProvider: fns exposed under `name.*` inside the sandbox.
// The LLM calls `order.getPendingOrders()`, `product.searchProducts()`, etc.
interface ResolvedProvider {
	name: string;
	fns: Record<string, (...args: unknown[]) => Promise<unknown>>;
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
}): ResolvedProvider[] {
	const url = `${storeApiUrl.replace(/\/+$/, "")}/trpc/bot`;
	const botClient = createTRPCClient<BotRouter>({
		links: [
			httpLink({
				url,
				transformer: SuperJSON,
				headers: () => ({ "X-Admin-Bot-Token": botToken }),
			}),
		],
	});

	return [
		{
			name: "order",
			fns: {
				getPendingOrders: async () => botClient.order.getPendingOrders.query(),
				getAllOrders: async () => botClient.order.getAllOrders.query(),
				getOrderById: async (input: unknown) => botClient.order.getOrderById.query(input as never),
				getOrderCount: async (input: unknown) => botClient.order.getOrderCount.query(input as never),
				getRecentOrdersByProductId: async (input: unknown) => botClient.order.getRecentOrdersByProductId.query(input as never),
				getPaginatedOrders: async (input: unknown) => botClient.order.getPaginatedOrders.query(input as never),
				searchOrder: async (input: unknown) => botClient.order.searchOrder.mutate(input as never),
				searchOrderQuick: async (input: unknown) => botClient.order.searchOrderQuick.query(input as never),
				addOrder: async (input: unknown) => botClient.order.addOrder.mutate(input as never),
				updateOrder: async (input: unknown) => botClient.order.updateOrder.mutate(input as never),
				updateOrderStatus: async (input: unknown) => botClient.order.updateOrderStatus.mutate(input as never),
				shipOrder: async (input: unknown) => botClient.order.shipOrder.mutate(input as never),
				deleteOrder: async (input: unknown) => botClient.order.deleteOrder.mutate(input as never),
				restoreOrder: async (input: unknown) => botClient.order.restoreOrder.mutate(input as never),
			},
		},
		{
			name: "product",
			fns: {
				getAllProducts: async () => botClient.product.getAllProducts.query(),
				getProductById: async (input: unknown) => botClient.product.getProductById.query(input as never),
				getPaginatedProducts: async (input: unknown) => botClient.product.getPaginatedProducts.query(input as never),
				searchProductByName: async (input: unknown) => botClient.product.searchProductByName.query(input as never),
				searchProductsInstant: async (input: unknown) => botClient.product.searchProductsInstant.query(input as never),
				getAllProductValue: async () => botClient.product.getAllProductValue.query(),
				getReviewProducts: async () => botClient.product.getReviewProducts.query(),
				addProduct: async (input: unknown) => botClient.product.addProduct.mutate(input as never),
				updateProduct: async (input: unknown) => botClient.product.updateProduct.mutate(input as never),
				updateStock: async (input: unknown) => botClient.product.updateStock.mutate(input as never),
				setProductStock: async (input: unknown) => botClient.product.setProductStock.mutate(input as never),
				updateProductField: async (input: unknown) => botClient.product.updateProductField.mutate(input as never),
				deleteProduct: async (input: unknown) => botClient.product.deleteProduct.mutate(input as never),
			},
		},
		{
			name: "customer",
			fns: {
				getAllCustomers: async () => botClient.customer.getAllCustomers.query(),
				getCustomerByPhone: async (input: unknown) => botClient.customer.getCustomerByPhone.query(input as never),
				getCustomerCount: async () => botClient.customer.getCustomerCount.query(),
				getNewCustomersCount: async (input: unknown) => botClient.customer.getNewCustomersCount.query(input as never),
				addUser: async (input: unknown) => botClient.customer.addUser.mutate(input as never),
				updateCustomer: async (input: unknown) => botClient.customer.updateCustomer.mutate(input as never),
				deleteCustomer: async (input: unknown) => botClient.customer.deleteCustomer.mutate(input as never),
			},
		},
		{
			name: "payment",
			fns: {
				getPayments: async (input: unknown) => botClient.payment.getPayments.query(input as never),
				getPendingPayments: async () => botClient.payment.getPendingPayments.query(),
				getPendingMessengerNotifications: async () => botClient.payment.getPendingMessengerNotifications.query(),
				getClaimedTransferCount: async () => botClient.payment.getClaimedTransferCount.query(),
				getClaimedTransferPayments: async () => botClient.payment.getClaimedTransferPayments.query(),
				createPayment: async (input: unknown) => botClient.payment.createPayment.mutate(input as never),
				confirmTransferPayment: async (input: unknown) => botClient.payment.confirmTransferPayment.mutate(input as never),
				rejectTransferPayment: async (input: unknown) => botClient.payment.rejectTransferPayment.mutate(input as never),
			},
		},
		{
			name: "sales",
			fns: {
				analytics: async () => botClient.sales.analytics.query(),
				topProducts: async (input: unknown) => botClient.sales.topProducts.query(input as never),
				weeklyOrders: async () => botClient.sales.weeklyOrders.query(),
				avgOrderValue: async (input: unknown) => botClient.sales.avgOrderValue.query(input as never),
				orderCount: async (input: unknown) => botClient.sales.orderCount.query(input as never),
				pendingOrders: async () => botClient.sales.pendingOrders.query(),
				dashboard: async () => botClient.sales.dashboard.query(),
			},
		},
		{
			name: "analytics",
			fns: {
				getAverageOrderValue: async (input: unknown) => botClient.analytics.getAverageOrderValue.query(input as never),
				getTotalProfit: async (input: unknown) => botClient.analytics.getTotalProfit.query(input as never),
				getSalesByCategory: async (input: unknown) => botClient.analytics.getSalesByCategory.query(input as never),
				getCustomerLifetimeValue: async () => botClient.analytics.getCustomerLifetimeValue.query(),
				getRepeatCustomersCount: async (input: unknown) => botClient.analytics.getRepeatCustomersCount.query(input as never),
				getInventoryStatus: async () => botClient.analytics.getInventoryStatus.query(),
				getFailedPayments: async (input: unknown) => botClient.analytics.getFailedPayments.query(input as never),
				getLowInventoryProducts: async () => botClient.analytics.getLowInventoryProducts.query(),
				getTopBrandsBySales: async (input: unknown) => botClient.analytics.getTopBrandsBySales.query(input as never),
				getCurrentProductsValue: async () => botClient.analytics.getCurrentProductsValue.query(),
				getAnalyticsData: async (input: unknown) => botClient.analytics.getAnalyticsData.query(input as never),
				getHomePageData: async (input: unknown) => botClient.analytics.getHomePageData.query(input as never),
				getWebAnalytics: async (input: unknown) => botClient.analytics.getWebAnalytics.query(input as never),
				getConversionFunnel: async (input: unknown) => botClient.analytics.getConversionFunnel.query(input as never),
				getTopSearches: async (input: unknown) => botClient.analytics.getTopSearches.query(input as never),
				getMostViewedProducts: async (input: unknown) => botClient.analytics.getMostViewedProducts.query(input as never),
				getProductBehavior: async (input: unknown) => botClient.analytics.getProductBehavior.query(input as never),
				getDailyVisitorTrend: async (input: unknown) => botClient.analytics.getDailyVisitorTrend.query(input as never),
			},
		},
		{
			name: "purchase",
			fns: {
				getAllPurchases: async () => botClient.purchase.getAllPurchases.query(),
				getPurchaseById: async (input: unknown) => botClient.purchase.getPurchaseById.query(input as never),
				getPaginatedPurchases: async (input: unknown) => botClient.purchase.getPaginatedPurchases.query(input as never),
				searchPurchases: async (input: unknown) => botClient.purchase.searchPurchases.query(input as never),
				getAverageCostOfProduct: async (input: unknown) => botClient.purchase.getAverageCostOfProduct.query(input as never),
				addPurchase: async (input: unknown) => botClient.purchase.addPurchase.mutate(input as never),
				updatePurchase: async (input: unknown) => botClient.purchase.updatePurchase.mutate(input as never),
				receivePurchase: async (input: unknown) => botClient.purchase.receivePurchase.mutate(input as never),
				deletePurchase: async (input: unknown) => botClient.purchase.deletePurchase.mutate(input as never),
				cancelPurchase: async (input: unknown) => botClient.purchase.cancelPurchase.mutate(input as never),
				markPurchaseShipped: async (input: unknown) => botClient.purchase.markPurchaseShipped.mutate(input as never),
				markPurchaseForwarderReceived: async (input: unknown) => botClient.purchase.markPurchaseForwarderReceived.mutate(input as never),
			},
		},
		{
			name: "brand",
			fns: {
				getAllBrands: async () => botClient.brands.getAllBrands.query(),
				addBrand: async (input: unknown) => botClient.brands.addBrand.mutate(input as never),
				updateBrand: async (input: unknown) => botClient.brands.updateBrand.mutate(input as never),
				deleteBrand: async (input: unknown) => botClient.brands.deleteBrand.mutate(input as never),
			},
		},
		{
			name: "category",
			fns: {
				getAllCategories: async () => botClient.category.getAllCategories.query(),
				getCategoryById: async (input: unknown) => botClient.category.getCategoryById.query(input as never),
				addCategory: async (input: unknown) => botClient.category.addCategory.mutate(input as never),
				updateCategory: async (input: unknown) => botClient.category.updateCategory.mutate(input as never),
				deleteCategory: async (input: unknown) => botClient.category.deleteCategory.mutate(input as never),
			},
		},
		{
			name: "image",
			fns: {
				addImage: async (input: unknown) => botClient.image.addImage.mutate(input as never),
				deleteImage: async (input: unknown) => botClient.image.deleteImage.mutate(input as never),
				setPrimaryImage: async (input: unknown) => botClient.image.setPrimaryImage.mutate(input as never),
			},
		},
		{
			name: "productImage",
			fns: {
				getAllImages: async () => botClient.productImages.getAllImages.query(),
				getImagesByProductId: async (input: unknown) => botClient.productImages.getImagesByProductId.query(input as never),
				addImage: async (input: unknown) => botClient.productImages.addImage.mutate(input as never),
				updateImage: async (input: unknown) => botClient.productImages.updateImage.mutate(input as never),
				deleteImage: async (input: unknown) => botClient.productImages.deleteImage.mutate(input as never),
				setPrimaryImage: async (input: unknown) => botClient.productImages.setPrimaryImage.mutate(input as never),
				uploadImagesFromUrl: async (input: unknown) => botClient.productImages.uploadImagesFromUrl.mutate(input as never),
			},
		},
		{
			// AI ingestion flows (#110). The primary chat path is the all-in-one
			// `extractProduct` (scrape + translate + draft) and
			// `extractPurchaseFromImageKeys` (invoice screenshots staged to R2 by
			// the webhook). The staged ai-product procedures are exposed in case
			// the model needs finer control, but `extractProduct` is preferred.
			name: "aiProduct",
			fns: {
				startExtraction: async (input: unknown) => botClient.aiProduct.startExtraction.mutate(input as never),
				scrapeAndAnalyze: async (input: unknown) => botClient.aiProduct.scrapeAndAnalyze.mutate(input as never),
				translateProduct: async (input: unknown) => botClient.aiProduct.translateProduct.mutate(input as never),
				finalizeExtraction: async (input: unknown) => botClient.aiProduct.finalizeExtraction.mutate(input as never),
				extractProduct: async (input: unknown) => botClient.aiProduct.extractProduct.mutate(input as never),
				batchCreateProducts: async (input: unknown) => botClient.aiProduct.batchCreateProducts.mutate(input as never),
				regenerateProductImages: async (input: unknown) => botClient.aiProduct.regenerateProductImages.mutate(input as never),
			},
		},
		{
			name: "aiPurchase",
			fns: {
				// Dashboard path: takes fetchable image urls. Prefer
				// `extractPurchaseFromImageKeys` from chat — the webhook stages
				// inbound screenshots to R2 and dispatches only the keys.
				extractPurchaseFromImages: async (input: unknown) => botClient.aiPurchase.extractPurchaseFromImages.mutate(input as never),
				// Chat path: takes R2 keys (messenger-inbound/...) the webhook
				// staged. The server resolves them to image bytes server-side.
				extractPurchaseFromImageKeys: async (input: unknown) => botClient.aiPurchase.extractPurchaseFromImageKeys.mutate(input as never),
				saveExtractedPurchase: async (input: unknown) => botClient.aiPurchase.saveExtractedPurchase.mutate(input as never),
			},
		},
	];
}

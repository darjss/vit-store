import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	CheckCircle,
	Copy,
	Edit3,
	Minus,
	Package,
	Plus,
	Receipt,
	Truck,
	User,
	X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EditableField } from "@/components/editable-field";
import OrderForm from "@/components/order/order-form";
import RowAction from "@/components/row-actions";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { orderStatus } from "@/lib/constants";
import {
	formatCurrency,
	getOrderStatusStyles,
	getPaymentProviderIcon,
	getPaymentStatusColor,
} from "@/lib/utils";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/orders/$id")({
	component: RouteComponent,
	loader: async ({ context: ctx, params }) => {
		const order = await ctx.queryClient.ensureQueryData(
			ctx.trpc.order.getOrderById.queryOptions({ id: Number(params.id) }),
		);
		return { order };
	},
});

function RouteComponent() {
	const { id } = Route.useParams();
	const orderId = Number(id);
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: order } = useSuspenseQuery({
		...trpc.order.getOrderById.queryOptions({ id: orderId }),
	});

	const { mutate: deleteOrder, isPending: isDeletePending } = useMutation({
		...trpc.order.deleteOrder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.order.getPaginatedOrders.queryOptions({}),
			);
			navigate({ to: "/orders" });
			toast.success("Захиалга амжилттай устгагдлаа");
		},
	});

	const { mutate: updateOrderStatus, isPending: isUpdateStatusPending } =
		useMutation({
			...trpc.order.updateOrderStatus.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.order.getOrderById.queryOptions({ id: orderId }),
				);
				toast.success("Захиалгын төлөв амжилттай шинэчлэгдлээ");
			},
		});

	const { mutate: updateOrderField, isPending: isUpdateFieldPending } =
		useMutation({
			...trpc.order.updateOrder.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.order.getOrderById.queryOptions({ id: orderId }),
				);
				toast.success("Захиалгын мэдээлэл амжилттай шинэчлэгдлээ");
			},
		});

	const deleteHelper = async (id: number) => {
		deleteOrder({ id });
	};

	const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
	const [isProductManagementMode, setIsProductManagementMode] = useState(false);

	const handleStatusChange = (newStatus: string) => {
		updateOrderStatus({
			id: orderId,
			status: newStatus as
				| "pending"
				| "shipped"
				| "delivered"
				| "cancelled"
				| "refunded",
		});
	};

	const handleCopyToClipboard = async (text: string, label: string) => {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(`${label} хуулагдлаа`);
		} catch {
			toast.error("Хуулахад алдаа гарлаа");
		}
	};

	const getNextStatus = () => {
		switch (order.status) {
			case "pending":
				return "shipped";
			case "shipped":
				return "delivered";
			default:
				return null;
		}
	};

	const nextStatus = getNextStatus();

	return (
		<>
			<Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Захиалгын дэлгэрэнгүй</DialogTitle>
						<DialogDescription>
							Захиалгын дэлгэрэнгүй мэдээлэл
						</DialogDescription>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
						<OrderForm
							order={{
								...order,
								customerPhone: order.customerPhone.toString(),
								isNewCustomer: false,
							}}
							onSuccess={() => {
								setIsEditDialogOpen(false);
								queryClient.invalidateQueries(
									trpc.order.getOrderById.queryOptions({ id: orderId }),
								);
							}}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
				<div className="mx-auto w-full max-w-none">
					<div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-center gap-3">
							<Button
								type="button"
								onClick={() => navigate({ to: "/orders" })}
								className="rounded-lg p-2 transition-colors hover:bg-muted"
							>
								<ArrowLeft className="h-5 w-5" />
							</Button>
							<div>
								<h1 className="font-heading text-xl sm:text-2xl md:text-3xl">
									Захиалгын дэлгэрэнгүй
								</h1>
								<p className="text-muted-foreground text-xs sm:text-sm md:text-base">
									#{order.orderNumber}
								</p>
							</div>
						</div>
						<div className="flex items-center gap-3">
							<EditableField
								label=""
								type="select"
								value={order.status}
								options={orderStatus.map((status) => ({
									value: status,
									label: status.charAt(0).toUpperCase() + status.slice(1),
								}))}
								className={`rounded-full border px-3 py-1 font-medium text-sm ${getOrderStatusStyles(order.status).badge}`}
								isLoading={isUpdateStatusPending}
								onSave={(next) => handleStatusChange(next)}
							/>
							<RowAction
								id={orderId}
								setIsEditDialogOpen={setIsEditDialogOpen}
								deleteMutation={deleteHelper}
								isDeletePending={isDeletePending}
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
						{/* Left Column */}
						<div className="space-y-6">
							{/* Customer Info */}
							<div className="border-2 border-border bg-card p-6 shadow-shadow">
								<h2 className="mb-6 flex items-center gap-2 font-heading text-xl">
									<User className="h-5 w-5" />
									Харилцагчийн мэдээлэл
								</h2>

								<div className="space-y-6">
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<p className="font-medium text-sm">Утасны дугаар:</p>
											<Button
												size="icon"
												variant="outline"
												className="h-8 w-8"
												onClick={() =>
													handleCopyToClipboard(
														`+976${order.customerPhone}`,
														"Утасны дугаар",
													)
												}
											>
												<Copy className="h-4 w-4" />
											</Button>
										</div>
										<EditableField
											label=""
											value={order.customerPhone.toString()}
											isLoading={isUpdateFieldPending}
											onSave={(next) =>
												updateOrderField({
													id: orderId,
													customerPhone: next,
													status: order.status,
													notes: order.notes,
													address: order.address,
													products: order.products || [],
													paymentStatus: order.paymentStatus,
													deliveryProvider: order.deliveryProvider,
													isNewCustomer: false,
												})
											}
										/>
									</div>

									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<p className="font-medium text-sm">Хүргэлтийн хаяг:</p>
											{order.address && (
												<Button
													size="icon"
													variant="outline"
													className="h-8 w-8"
													onClick={() =>
														handleCopyToClipboard(order.address, "Хаяг")
													}
												>
													<Copy className="h-4 w-4" />
												</Button>
											)}
										</div>
										<EditableField
											label=""
											type="textarea"
											value={order.address || ""}
											isLoading={isUpdateFieldPending}
											onSave={(next) =>
												updateOrderField({
													id: orderId,
													customerPhone: order.customerPhone.toString(),
													status: order.status,
													notes: order.notes,
													address: next,
													products: order.products || [],
													paymentStatus: order.paymentStatus,
													deliveryProvider: order.deliveryProvider,
													isNewCustomer: false,
												})
											}
										/>
									</div>

									<div className="space-y-2">
										<p className="font-medium text-sm">Тусгай заавар:</p>
										<EditableField
											label=""
											type="textarea"
											value={order.notes || ""}
											isLoading={isUpdateFieldPending}
											onSave={(next) =>
												updateOrderField({
													id: orderId,
													customerPhone: order.customerPhone.toString(),
													status: order.status,
													notes: next,
													address: order.address,
													products: order.products || [],
													paymentStatus: order.paymentStatus,
													deliveryProvider: order.deliveryProvider,
													isNewCustomer: false,
												})
											}
										/>
									</div>
								</div>
							</div>

							{/* Payment Info */}
							<div className="border-2 border-border bg-card p-6 shadow-shadow">
								<h2 className="mb-4 flex items-center gap-2 font-heading text-xl">
									<Receipt className="h-5 w-5" />
									Төлбөрийн мэдээлэл
								</h2>

								<div className="space-y-6">
									<EditableField
										label="Төлбөрийн төлөв:"
										type="select"
										value={order.paymentStatus}
										options={[
											{ value: "pending", label: "Хүлээгдэж буй" },
											{ value: "success", label: "Төлсөн" },
											{ value: "failed", label: "Алдаатай" },
										]}
										className={`rounded-full border px-3 py-1 font-medium text-sm ${getPaymentStatusColor(order.paymentStatus)}`}
										isLoading={isUpdateFieldPending}
										onSave={(next) =>
											updateOrderField({
												id: orderId,
												customerPhone: order.customerPhone.toString(),
												status: order.status,
												notes: order.notes,
												address: order.address,
												products: order.products || [],
												paymentStatus: next as "pending" | "success" | "failed",
												deliveryProvider: order.deliveryProvider,
												isNewCustomer: false,
											})
										}
									/>

									<div className="space-y-2">
										<p className="font-medium text-sm">Төлбөрийн хэрэгсэл:</p>
										<div className="flex items-center gap-2">
											<span className="text-muted-foreground">
												{getPaymentProviderIcon(order.paymentProvider)}
												{order.paymentProvider === "qpay"
													? "QPay"
													: order.paymentProvider === "transfer"
														? "Банкны шилжүүлэг"
														: "Бэлэн мөнгө"}
											</span>
										</div>
									</div>

									<div className="space-y-2">
										<p className="font-medium text-sm">Үүсгэсэн огноо:</p>
										<p className="text-muted-foreground">
											{new Date(order.createdAt).toLocaleDateString("mn-MN")}
										</p>
									</div>

									<div className="space-y-2">
										<p className="font-medium text-sm">Захиалгын дугаар:</p>
										<div className="flex items-center gap-2">
											<p className="font-mono text-muted-foreground">
												#{order.orderNumber}
											</p>
											<Button
												size="icon"
												variant="outline"
												className="h-8 w-8"
												onClick={() =>
													handleCopyToClipboard(
														order.orderNumber,
														"Захиалгын дугаар",
													)
												}
											>
												<Copy className="h-4 w-4" />
											</Button>
										</div>
									</div>
								</div>
							</div>
						</div>

						{/* Right Column */}
						<div className="space-y-6">
							{/* Order Items */}
							<div className="border-2 border-border bg-card p-6 shadow-shadow">
								<div className="mb-4 flex items-center justify-between">
									<h2 className="flex items-center gap-2 font-heading text-xl">
										<Package className="h-5 w-5" />
										Захиалгын бүтээгдэхүүн
									</h2>
									<Button
										variant="outline"
										size="sm"
										onClick={() =>
											setIsProductManagementMode(!isProductManagementMode)
										}
										className="gap-2"
									>
										<Edit3 className="h-4 w-4" />
										{isProductManagementMode ? "Хаах" : "Засах"}
									</Button>
								</div>

								<div className="space-y-4">
									{order.products?.map((product, index) => (
										<div
											key={`${product.productId}-${index}`}
											className="flex items-center gap-4 rounded-lg border bg-card p-4 shadow-sm"
										>
											<div className="h-16 w-16 overflow-hidden rounded-lg border bg-background">
												<img
													src={product.imageUrl || "/placeholder.jpg"}
													alt={product.name}
													className="h-full w-full object-cover"
												/>
											</div>
											<div className="flex-1">
												<h3 className="font-medium text-sm">{product.name}</h3>
												<div className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
													<span>Тоо: {product.quantity}</span>
													<span>•</span>
													<span>{formatCurrency(product.price)} / ширхэг</span>
												</div>
											</div>
											<div className="flex items-center gap-2">
												{isProductManagementMode && (
													<div className="flex items-center gap-1">
														<Button
															size="icon"
															variant="outline"
															className="h-8 w-8"
															onClick={() => {
																// TODO: Implement quantity decrease
																toast.info(
																	"Тоо бууруулах функц хөгжүүлэгдэж байна",
																);
															}}
														>
															<Minus className="h-4 w-4" />
														</Button>
														<span className="font-medium text-sm">
															{product.quantity}
														</span>
														<Button
															size="icon"
															variant="outline"
															className="h-8 w-8"
															onClick={() => {
																// TODO: Implement quantity increase
																toast.info(
																	"Тоо нэмэх функц хөгжүүлэгдэж байна",
																);
															}}
														>
															<Plus className="h-4 w-4" />
														</Button>
													</div>
												)}
												<div className="text-right">
													<p className="font-semibold text-foreground text-sm">
														{formatCurrency(product.price * product.quantity)}
													</p>
													{isProductManagementMode && (
														<Button
															size="icon"
															variant="destructive"
															className="mt-2 h-8 w-8"
															onClick={() => {
																// TODO: Implement product removal
																toast.info(
																	"Бүтээгдэхүүн устгах функц хөгжүүлэгдэж байна",
																);
															}}
														>
															<X className="h-4 w-4" />
														</Button>
													)}
												</div>
											</div>
										</div>
									))}
								</div>

								{isProductManagementMode && (
									<div className="mt-6 border-t pt-4">
										<Button
											variant="outline"
											className="w-full gap-2"
											onClick={() => {
												// TODO: Implement add product functionality
												toast.info(
													"Бүтээгдэхүүн нэмэх функц хөгжүүлэгдэж байна",
												);
											}}
										>
											<Plus className="h-4 w-4" />
											Бүтээгдэхүүн нэмэх
										</Button>
									</div>
								)}

								<div className="mt-6 border-t pt-4">
									<div className="space-y-3">
										<div className="flex items-center justify-between">
											<span className="font-semibold text-lg">Нийт дүн:</span>
											<span className="font-bold text-primary text-xl">
												{formatCurrency(order.total)}
											</span>
										</div>
										<div className="flex items-center justify-between text-muted-foreground text-sm">
											<span>Бүтээгдэхүүний тоо:</span>
											<span>{order.products?.length || 0}</span>
										</div>
										<div className="flex items-center justify-between text-muted-foreground text-sm">
											<span>Нийт ширхэг:</span>
											<span>
												{order.products?.reduce(
													(sum, p) => sum + p.quantity,
													0,
												) || 0}
											</span>
										</div>
									</div>
								</div>
							</div>

							{/* Quick Actions */}
							{nextStatus && (
								<div className="border-2 border-border bg-card p-6 shadow-shadow">
									<h2 className="mb-4 flex items-center gap-2 font-heading text-xl">
										<Truck className="h-5 w-5" />
										Хурдан үйлдэл
									</h2>

									<div className="space-y-3">
										<Button
											onClick={() => handleStatusChange(nextStatus)}
											disabled={isUpdateStatusPending}
											className="w-full gap-2"
										>
											{nextStatus === "shipped" ? (
												<>
													<Truck className="h-4 w-4" />
													Илгээх
												</>
											) : (
												<>
													<CheckCircle className="h-4 w-4" />
													Хүргэх
												</>
											)}
										</Button>
									</div>
								</div>
							)}

							{/* Order Timeline */}
							<div className="border-2 border-border bg-card p-6 shadow-shadow">
								<h2 className="mb-4 flex items-center gap-2 font-heading text-xl">
									<Calendar className="h-5 w-5" />
									Захиалгын түүх
								</h2>

								<div className="space-y-3">
									<div className="flex items-center gap-3">
										<div className="h-2 w-2 rounded-full bg-primary" />
										<div className="flex-1">
											<p className="font-medium text-sm">Захиалга үүсгэгдсэн</p>
											<p className="text-muted-foreground text-xs">
												{new Date(order.createdAt).toLocaleString("mn-MN")}
											</p>
										</div>
									</div>

									{order.status !== "pending" && (
										<div className="flex items-center gap-3">
											<div className="h-2 w-2 rounded-full bg-blue-500" />
											<div className="flex-1">
												<p className="font-medium text-sm">
													{order.status === "shipped"
														? "Илгээгдсэн"
														: order.status === "delivered"
															? "Хүргэгдсэн"
															: "Захиалга цуцлагдсан"}
												</p>
												<p className="text-muted-foreground text-xs">
													{order.updatedAt
														? new Date(order.updatedAt).toLocaleString("mn-MN")
														: "Тодорхойгүй"}
												</p>
											</div>
										</div>
									)}
								</div>
							</div>

							{/* Status Alert */}
							{order.status === "pending" && (
								<div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 sm:p-4">
									<div className="flex items-center gap-2 text-destructive">
										<AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
										<span className="font-medium text-sm sm:text-base">
											Захиалга хүлээгдэж буй
										</span>
									</div>
									<p className="mt-1 text-destructive text-xs sm:text-sm">
										Энэ захиалгыг илгээх эсвэл цуцлах хэрэгтэй.
									</p>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}

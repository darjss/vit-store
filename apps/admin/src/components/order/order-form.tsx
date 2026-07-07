import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addOrderSchema, orderStatusLabels, type addOrderType } from "@vit/shared";
import { orderStatus, paymentStatus } from "@vit/shared/constants";
import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/utils/trpc";
import SubmitButton from "../submit-button";
import { Card, CardContent } from "../ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "../ui/form";
import { FormLoadingOverlay } from "../ui/form-loading-overlay";
import { Input } from "../ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import SelectProductForm from "./select-product-form";

const OrderForm = ({
	order,
	onSuccess,
}: {
	order?: addOrderType;
	onSuccess: () => void;
}) => {
	const form = useForm<addOrderType>({
		resolver: valibotResolver(addOrderSchema),
		defaultValues: {
			customerPhone: order?.customerPhone || "",
      address: order?.address || "",
			addressZoneId: order?.addressZoneId ? Number(order.addressZoneId) : undefined,
			notes: order?.notes || "",
      status: order?.status || "pending",
			paymentStatus: order?.paymentStatus || "pending",
			deliveryProvider: order?.deliveryProvider || "tu-delivery",
			isNewCustomer: order?.isNewCustomer ?? true,
			products: order?.products || [],
		},
	});

	const phone = form.watch("customerPhone");
	const isValidPhone =
		phone && phone.length === 8 && phone.match("^[6-9]\\d{7}$");

  const queryClient = useQueryClient();
  const {data:addressZones} = useQuery({
	...trpc.order.getDeliveryAddressZones.queryOptions(),
  })

	const isEditing = !!order;

	const prevPhoneRef = useRef(order?.customerPhone ?? "");

	const shipOrder = useMutation({
		...trpc.order.shipOrder.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(trpc.order.getAllOrders.queryOptions());
			queryClient.invalidateQueries({
				...trpc.order.getPaginatedOrders.queryKey,
			});
			toast.success("Захиалга амжилттай илгээгдлээ");
			onSuccess();
		},
		onError: (error) => {
			toast.error(`Захиалга илгээхэд алдаа гарлаа: ${error.message}`);
		},
	});

	const addMutation = useMutation({
		...trpc.order.addOrder.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.order.getAllOrders.queryOptions());
			onSuccess();
		},
		onError: (_error) => {
			toast.error("Failed to add order");
		},
	});

	const updateMutation = useMutation({
		...trpc.order.updateOrder.mutationOptions(),
		onSuccess: async () => {
			queryClient.invalidateQueries(trpc.order.getAllOrders.queryOptions());
			queryClient.invalidateQueries({
				...trpc.order.getPaginatedOrders.queryKey,
			});
			onSuccess();
		},
		onError: (_error) => {
			toast.error("Failed to update order");
		},
	});

	const {
		data: customerInfo,
		isLoading: isSearchByLoading,
		isSuccess,
	} = useQuery({
		...trpc.customer.getCustomerByPhone.queryOptions({
			phone: Number(phone),
		}),

		enabled: !!isValidPhone,
	});

	const handlePhoneChange = useCallback(() => {
		const result = customerInfo;
		if (result && isSuccess) {
			form.setValue("isNewCustomer", false);
			form.setValue("address", result.address ?? "", {
				shouldValidate: true,
				shouldDirty: true,
				shouldTouch: true,
			});
			form.setValue("addressZoneId", result.addressZoneId ? Number(result.addressZoneId) : undefined, {
				shouldValidate: true,
				shouldDirty: true,
				shouldTouch: true,
			});
			return;
		}

		form.setValue("isNewCustomer", true);
	}, [customerInfo, form, isSuccess]);

	const isMutating = addMutation.isPending || updateMutation.isPending;

	const onSubmit = async (values: addOrderType) => {
		if (isMutating) return;
		if (isEditing && order?.id) {
			updateMutation.mutate({ ...values, id: order.id });
		} else {
			addMutation.mutate(values);
		}
	};

	useEffect(() => {
		if (!isValidPhone) return;
		if (isEditing && phone === prevPhoneRef.current) return;
		prevPhoneRef.current = phone;
		handlePhoneChange();
	}, [handlePhoneChange, isValidPhone, isEditing, phone]);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="relative">
				<FormLoadingOverlay isLoading={isMutating} />
				<div className="grid grid-cols-1 gap-4">
					<Card className="border-2 border-border bg-transparent shadow-none">
						<CardContent className="space-y-4 p-3 sm:p-4">
							<h3 className="font-bold text-sm uppercase tracking-wider">
								Харилцагчийн мэдээлэл
							</h3>
							<FormField
								control={form.control}
								name="customerPhone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Утасны дугаар</FormLabel>
										<FormControl>
											<Input
												placeholder="Утасны дугаар оруулах"
												{...field}
												inputMode="tel"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
              />
             	<FormField
								control={form.control}
								name="addressZoneId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Хаяг бүс</FormLabel>
										<Select
											onValueChange={(value) => field.onChange(Number(value))}
											value={field.value ? field.value.toString() : undefined}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Хаяг бүс сонгох" />
												</SelectTrigger>
											</FormControl>
                      <SelectContent>
                        
												{(addressZones===undefined || addressZones.length=== 0) && <div>Хаяг бүс байхгүй</div>}
												{addressZones !== undefined && addressZones.length > 0 &&
													addressZones.map((zone) => (
														<SelectItem 
															key={zone.Id}
															value={zone.Id.toString()}
														>
															{zone.zoneName}
														</SelectItem>
													))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="address"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Хүргэлтийн хаяг</FormLabel>
										<FormControl>
											<Textarea
												disabled={isSearchByLoading}
												placeholder={
													isSearchByLoading
														? "Хүргэлтийн хаяг хайж байна..."
														: "Хүргэлтийн хаяг оруулах"
												}
												{...field}
												className="h-20 resize-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<Card className="border-2 border-border bg-transparent shadow-none">
						<CardContent className="space-y-4 p-3 sm:p-4">
							<h3 className="font-bold text-sm uppercase tracking-wider">
								Захиалгын дэлгэрэнгүй
							</h3>
							<FormField
								control={form.control}
								name="notes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Тусгай заавар</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Тусгай заавар эсвэл тэмдэглэл"
												{...field}
												className="h-20 resize-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="grid gap-3 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="status"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Захиалгын төлөв</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value || "pending"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Төлөв сонгох" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{orderStatus.map((status, index) => (
														<SelectItem key={index} value={status}>
															{orderStatusLabels[status] ?? status}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="paymentStatus"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Төлбөрийн төлөв</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value || "pending"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Төлбөрийн төлөв сонгох" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{paymentStatus.map((status, index) => (
														<SelectItem key={index} value={status}>
															{status.charAt(0).toUpperCase() + status.slice(1)}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</CardContent>
					</Card>

					<Card className="overflow-visible border-2 border-border bg-transparent shadow-none">
						<CardContent className="space-y-4 p-3 sm:p-4">
							<h3 className="font-bold text-sm uppercase tracking-wider">
								Бүтээгдэхүүн
							</h3>
							<SelectProductForm form={form} />
						</CardContent>
					</Card>

					<div className="flex items-center gap-3 pt-1">
					{isEditing && order?.status === "pending" && order?.id && (
						<Button
							type="button"
							variant="default"
							disabled={shipOrder.isPending}
							onClick={() => shipOrder.mutate({ orderId: order.id! })}
							className="gap-1.5 border-2 border-border font-bold text-sm uppercase tracking-wider"
						>
							<Truck className="h-4 w-4" />
							{shipOrder.isPending ? "Илгээж байна..." : "Илгээх"}
						</Button>
					)}
					<div className="flex-1" />
					<SubmitButton
						isPending={isMutating}
						className="border-2 border-border px-6 py-2.5 font-bold text-sm uppercase tracking-wider transition-colors duration-300 hover:bg-primary/90"
					>
						{order ? "Захиалга шинэчлэх" : "Захиалга баталгаажуулах"}
					</SubmitButton>
				</div>
				</div>
			</form>
		</Form>
	);
};

export default OrderForm;

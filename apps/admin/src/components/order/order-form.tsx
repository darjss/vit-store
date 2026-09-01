import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addOrderSchema, type addOrderType, orderStatusLabels } from "@vit/shared";
import { orderStatus, paymentStatus } from "@vit/shared/constants";
import { useCallback, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { paymentStatusLabel } from "@/lib/enum-labels";
import { trpc } from "@/utils/trpc";
import SubmitButton from "../submit-button";
import { Card, CardContent } from "../ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { FormLoadingOverlay } from "../ui/form-loading-overlay";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import SelectProductForm from "./select-product-form";

// ponytail: legacy admin order form — split sections later; complexity ceiling 25
// oxlint-disable-next-line complexity
const OrderForm = ({ onSuccess, order }: { onSuccess: () => void; order?: addOrderType }) => {
	const form = useForm<addOrderType>({
		defaultValues: {
			address: order?.address || "",
			addressZoneId: order?.addressZoneId ? Number(order.addressZoneId) : undefined,
			customerPhone: order?.customerPhone || "",
			deliveryProvider: order?.deliveryProvider || "tu-delivery",
			isNewCustomer: order?.isNewCustomer ?? true,
			notes: order?.notes || "",
			paymentStatus: order?.paymentStatus || "pending",
			products: order?.products || [],
			status: order?.status || "pending",
		},
		resolver: valibotResolver(addOrderSchema),
	});

	const phone = useWatch({ control: form.control, name: "customerPhone" });
	const isValidPhone = phone && phone.length === 8 && phone.match(String.raw`^[6-9]\d{7}$`);

	const queryClient = useQueryClient();
	const isEditing = !!order;

	const prevPhoneRef = useRef(order?.customerPhone ?? "");

	const addMutation = useMutation({
		...trpc.order.addOrder.mutationOptions(),
		onError: (_error) => {
			toast.error("Захиалга нэмэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			form.reset();
			onSuccess();
		},
	});

	const updateMutation = useMutation({
		...trpc.order.updateOrder.mutationOptions(),
		onError: (_error) => {
			toast.error("Захиалга шинэчлэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			if (order?.id) {
				void queryClient.invalidateQueries(trpc.order.getOrderById.queryOptions({ id: order.id }));
			}
			void queryClient.invalidateQueries(trpc.order.getPaginatedOrders.pathFilter());
			onSuccess();
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
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
			return;
		}

		form.setValue("isNewCustomer", true);
	}, [customerInfo, form, isSuccess]);

	const isMutating = addMutation.isPending || updateMutation.isPending;

	const onSubmit = async (values: addOrderType) => {
		if (isMutating) {
			return;
		}
		if (isEditing && order?.id) {
			updateMutation.mutate({ ...values, id: order.id });
		} else {
			addMutation.mutate(values);
		}
	};

	useEffect(() => {
		if (!isValidPhone) {
			return;
		}
		if (isEditing && phone === prevPhoneRef.current) {
			return;
		}
		prevPhoneRef.current = phone;
		handlePhoneChange();
	}, [handlePhoneChange, isValidPhone, isEditing, phone]);

	return (
		<Form {...form}>
			<form className="relative" onSubmit={form.handleSubmit(onSubmit)}>
				<FormLoadingOverlay isLoading={isMutating} />
				<div className="grid grid-cols-1 gap-4">
					<Card className="border-border border-2 bg-transparent shadow-none">
						<CardContent className="space-y-4 p-3 sm:p-4">
							<h3 className="text-sm font-bold tracking-wider uppercase">Харилцагчийн мэдээлэл</h3>
							<FormField
								control={form.control}
								name="customerPhone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Утасны дугаар</FormLabel>
										<FormControl>
											<Input placeholder="Утасны дугаар оруулах" {...field} inputMode="tel" />
										</FormControl>
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

					<Card className="border-border border-2 bg-transparent shadow-none">
						<CardContent className="space-y-4 p-3 sm:p-4">
							<h3 className="text-sm font-bold tracking-wider uppercase">Захиалгын дэлгэрэнгүй</h3>
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
												defaultValue={field.value || "pending"}
												onValueChange={field.onChange}
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
												defaultValue={field.value || "pending"}
												onValueChange={field.onChange}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Төлбөрийн төлөв сонгох" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													{paymentStatus.map((status, index) => (
														<SelectItem key={index} value={status}>
															{paymentStatusLabel[status]}
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

					<Card className="border-border overflow-visible border-2 bg-transparent shadow-none">
						<CardContent className="space-y-4 p-3 sm:p-4">
							<h3 className="text-sm font-bold tracking-wider uppercase">Бүтээгдэхүүн</h3>
							<SelectProductForm form={form} />
						</CardContent>
					</Card>

					<div className="flex items-center justify-end pt-1">
						<SubmitButton
							className="border-border hover:bg-primary/90 border-2 px-6 py-2.5 text-sm font-bold tracking-wider uppercase transition-colors duration-300"
							isPending={isMutating}
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

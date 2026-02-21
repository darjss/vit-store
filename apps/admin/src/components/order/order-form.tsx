import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addOrderSchema, type addOrderType } from "@vit/shared";
import { orderStatus, paymentStatus } from "@vit/shared/constants";
import { useCallback, useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
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
	const form = useForm({
		resolver: valibotResolver(addOrderSchema),
		defaultValues: {
			customerPhone: order?.customerPhone || "",
			address: order?.address || "",
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
	const mutation = useMutation({
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

	const handlePhoneChange = useCallback(
		async (form: UseFormReturn<any>) => {
			const result = customerInfo;
			if (result && isSuccess) {
				form.setValue("isNewCustomer", false);
				form.setValue("address", result?.address, {
					shouldValidate: true,
					shouldDirty: true,
					shouldTouch: true,
				});
			} else {
				form.setValue("isNewCustomer", true);
			}
		},
		[customerInfo, isSuccess],
	);

	const onSubmit = async (values: addOrderType) => {
		mutation.mutate(values);
	};

	useEffect(() => {
		if (isValidPhone) {
			handlePhoneChange(form);
		}
	}, [isValidPhone, handlePhoneChange, form]);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
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
															{status.charAt(0).toUpperCase() + status.slice(1)}
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

					<div className="flex justify-end pt-1">
						<SubmitButton
							isPending={form.formState.isSubmitting}
							className="w-full border-2 border-border px-6 py-2.5 font-bold text-sm uppercase tracking-wider transition-colors duration-300 hover:bg-primary/90 sm:w-auto"
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

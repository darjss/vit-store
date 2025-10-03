import { zodResolver } from "@hookform/resolvers/zod";
import { addOrderSchema, type addOrderType } from "@server/lib/zod/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useForm } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { orderStatus, paymentStatus } from "@/lib/constants";
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
		resolver: zodResolver(addOrderSchema),
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

	const queryClient = useQueryClient();
	const mutation = useMutation({
		...trpc.order.addOrder.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.order.getAllOrders.queryOptions());
			onSuccess();
		},
		onError: (error) => {
			console.error("error", error);
			toast.error("Failed to add order");
		},
	});

	const { data: customerInfo, isLoading: isSearchByLoading } = useQuery({
		...trpc.customer.getCustomerByPhone.queryOptions({
			phone: Number(phone),
		}),
		enabled: !!(phone && phone.length === 8 && phone.match("^[6-9]\\d{7}$")),
	});

	const handlePhoneChange = useCallback(
		async (phone: number, form: UseFormReturn<any>) => {
			const result = customerInfo;
			if (result) {
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
		[customerInfo],
	);

	const onSubmit = async (values: addOrderType) => {
		console.log("submitting values", values);
		mutation.mutate(values);
	};

	useEffect(() => {
		if (phone && phone.length === 8 && phone.match("^[6-9]\\d{7}$")) {
			handlePhoneChange(Number.parseInt(phone), form);
		}
	}, [phone, handlePhoneChange, form]);

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="font-semibold text-xl">Customer Details</h3>
							<FormField
								control={form.control}
								name="customerPhone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Phone Number</FormLabel>
										<FormControl>
											<Input
												placeholder="Enter phone number"
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
										<FormLabel>Delivery Address</FormLabel>
										<FormControl>
											<Textarea
												disabled={isSearchByLoading}
												placeholder={
													isSearchByLoading
														? "Searching for delivery address..."
														: "Enter delivery address"
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

					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="font-semibold text-xl">Order Details</h3>
							<FormField
								control={form.control}
								name="notes"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Special Instructions</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Any special instructions or notes"
												{...field}
												className="h-20 resize-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<div className="grid gap-4 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="status"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Order Status</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value || "pending"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select status" />
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
											<FormLabel>Payment Status</FormLabel>
											<Select
												onValueChange={field.onChange}
												defaultValue={field.value || "pending"}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select payment status" />
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

					<Card className="overflow-visible shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="font-semibold text-xl">Products</h3>
							<SelectProductForm form={form} />
						</CardContent>
					</Card>

					<div className="flex justify-end">
						<SubmitButton
							isPending={form.formState.isSubmitting}
							className="w-full px-8 py-3 font-semibold text-lg transition-colors duration-300 hover:bg-primary/90 sm:w-auto"
						>
							{order ? "Update Order" : "Complete Order"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default OrderForm;

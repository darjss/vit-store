import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	type InferOutput,
	maxLength,
	minLength,
	object,
	optional,
	pipe,
	regex,
	string,
} from "valibot";
import { trpc } from "@/utils/trpc";
import SubmitButton from "../submit-button";
import { Card, CardContent } from "../ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { FormLoadingOverlay } from "../ui/form-loading-overlay";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

const addCustomerSchema = object({
	address: optional(
		pipe(string("Хаяг заавал оруулах"), minLength(5, "Хаяг хэт богино байна")),
	),
	phone: pipe(
		string("Дугаар заавал оруулах"),
		minLength(8, "Дугаар 8 оронтой байх ёстой"),
		maxLength(8, "Дугаар 8 оронтой байх ёстой"),
		regex(/^[6-9]\d{7}$/, "Зөв дугаар оруулна уу"),
	),
});

type AddCustomerFormValues = InferOutput<typeof addCustomerSchema>;

type CustomerFormProps = {
	customer?: { address?: string | null; phone: number };
	onSuccess: () => void;
};

const CustomerForm = ({ customer, onSuccess }: CustomerFormProps) => {
	const form = useForm<AddCustomerFormValues>({
		defaultValues: {
			address: customer?.address ?? "",
			phone: customer ? String(customer.phone) : "",
		},
		resolver: valibotResolver(addCustomerSchema),
	});

	const queryClient = useQueryClient();

	const addMutation = useMutation({
		...trpc.customer.addUser.mutationOptions(),
		onError: (_error) => {
			toast.error("Хэрэглэгч нэмэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.customer.getAllCustomers.queryOptions());
			onSuccess();
		},
	});

	const updateMutation = useMutation({
		...trpc.customer.updateCustomer.mutationOptions(),
		onError: (_error) => {
			toast.error("Хэрэглэгч засахад алдаа гарлаа");
		},
		onSuccess: async () => {
			queryClient.invalidateQueries(trpc.customer.getAllCustomers.queryOptions());
			onSuccess();
		},
	});

	const onSubmit = (values: AddCustomerFormValues) => {
		if (addMutation.isPending || updateMutation.isPending) {
			return;
		}
		if (customer) {
			updateMutation.mutate({
				address: values.address || undefined,
				phone: Number(customer.phone),
			});
			return;
		}
		addMutation.mutate({
			address: values.address || undefined,
			phone: Number(values.phone),
		});
	};

	const isEditing = Boolean(customer);
	const isPending = addMutation.isPending || updateMutation.isPending;

	return (
		<Form {...form}>
			<form className="relative" onSubmit={form.handleSubmit(onSubmit)}>
				<FormLoadingOverlay isLoading={isPending} />
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="text-xl font-semibold">
								{isEditing ? "Хэрэглэгч засах" : "Хэрэглэгчийн мэдээлэл"}
							</h3>
							<FormField
								control={form.control}
								name="phone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Утасны дугаар</FormLabel>
										<FormControl>
											<Input
												disabled={isEditing}
												inputMode="numeric"
												maxLength={8}
												placeholder="8 оронтой дугаар"
												{...field}
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
										<FormLabel>Хаяг </FormLabel>
										<FormControl>
											<Textarea placeholder="Хаяг оруулах" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<div className="flex justify-end">
						<SubmitButton
							className="hover:bg-primary/90 w-full px-8 py-3 text-lg font-semibold transition-colors duration-300 sm:w-auto"
							isPending={isPending}
						>
							{isEditing ? "Хадгалах" : "Хэрэглэгч нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default CustomerForm;

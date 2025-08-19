import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
	addBrandSchema,
	type addBrandType,
} from "../../../../server/src/lib/zod/schema";
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
import { Image } from "@unpic/react";

const BrandForm = ({
	brand,
	onSuccess,
}: {
	brand?: addBrandType;
	onSuccess: () => void;
}) => {
	const form = useForm({
		resolver: zodResolver(addBrandSchema),
		defaultValues: {
			name: brand?.name || "",
			logoUrl: brand?.logoUrl || "",
		},
	});
	const queryClient = useQueryClient();
	const mutation = useMutation({
		...trpc.brands.addBrand.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.brands.getAllBrands.queryOptions());
			onSuccess();
		},
		onError: (error) => {
			console.error("error", error);
			toast.error("Failed to update brand");
		},
	});
	const onSubmit = async (values: addBrandType) => {
		console.log("submitting values", values);
		mutation.mutate(values);
	};
	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-4 sm:space-y-6">
					<Card className="overflow-hidden shadow-shadow">
						<CardContent className="p-4 sm:p-6">
							<h3 className="mb-4 font-bold font-heading text-base sm:text-lg">
								Brand Details
							</h3>
							<div className="grid gap-4 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Brand Name
											</FormLabel>
											<FormControl>
												<Input
													placeholder="Enter brand name"
													{...field}
													className="h-10"
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="logoUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Logo URL
											</FormLabel>
											<FormControl>
												<Input
													placeholder="Enter logo URL"
													{...field}
													value={field.value || ""}
													className="h-10"
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
							{brand?.logoUrl && (
								<Image
									src={form.watch("logoUrl") || ""}
									alt={form.watch("name") || ""}
									width={100}
									height={100}
									layout="constrained"
									className="h-full w-full object-contain p-4"
								/>
							)}
						</CardContent>
					</Card>

					<div className="sticky bottom-0 bg-background py-3 sm:py-4">
						<SubmitButton
							isPending={form.formState.isSubmitting}
							className="h-10 w-full rounded-base px-4 font-heading text-sm transition-transform hover:translate-x-boxShadowX hover:translate-y-boxShadowY"
						>
							{brand ? "Update Brand" : "Add Brand"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default BrandForm;

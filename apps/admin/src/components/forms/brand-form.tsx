import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import {
	addBrandSchema,
	type addBrandType,
} from "../../../../server/src/lib/zod/schema";
import { ImagePlaceholderIcon } from "../icons";
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
import { UploadButton } from "../upload-button";

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
			imageUrl: brand?.imageUrl || "",
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

	const currentImageUrl = form.watch("imageUrl");

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className="space-y-4 sm:space-y-6">
					<Card className="overflow-hidden shadow-shadow">
						<CardContent className="p-4 sm:p-6">
							<h3 className="mb-4 font-bold font-heading text-base sm:text-lg">
								Brand Details
							</h3>
							<div className="space-y-4">
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
									name="imageUrl"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Logo Image
											</FormLabel>
											<FormControl>
												<div className="space-y-3">
													{currentImageUrl ? (
														<div className="flex justify-center">
															<Image
																src={currentImageUrl}
																alt={form.watch("name") || "Brand logo"}
																width={100}
																height={100}
																layout="constrained"
																className="h-24 w-24 rounded-base border object-contain p-2"
															/>
														</div>
													) : (
														<div className="flex justify-center">
															<div className="flex h-24 w-24 items-center justify-center rounded-base border-2 border-border border-dashed bg-secondary-background">
																<div className="text-center">
																	<ImagePlaceholderIcon className="mx-auto h-8 w-8 text-foreground/60" />
																	<p className="mt-1 text-foreground/60 text-xs">
																		Upload Logo
																	</p>
																</div>
															</div>
														</div>
													)}
													<div className="flex justify-center">
														<UploadButton setValue={form.setValue} />
													</div>
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
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

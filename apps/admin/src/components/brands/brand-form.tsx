import { zodResolver } from "@hookform/resolvers/zod";
import { addBrandSchema, type addBrandType } from "@server/lib/zod/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { ImagePlaceholderIcon } from "../icons";
import SubmitButton from "../submit-button";
import { Button } from "../ui/button";
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
			toast.error("Брэнд шинэчлэхэд алдаа гарлаа");
		},
	});
	const onSubmit = async (values: addBrandType) => {
		console.log("submitting values", values);
		mutation.mutate(values);
	};

	const currentImageUrl = brand ? brand.logoUrl : form.watch("logoUrl");

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-1 gap-5">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-5 p-5 sm:p-6">
							<h3 className="font-semibold text-base sm:text-lg">
								Брэндийн мэдээлэл
							</h3>
							<div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Брэндийн нэр
											</FormLabel>
											<FormControl>
												<Input placeholder="Брэндийн нэр оруулах" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="logoUrl"
									render={() => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Лого зураг
											</FormLabel>
											<FormControl>
												<div className="flex flex-col items-center space-y-3 sm:items-start">
													{currentImageUrl ? (
														<div className="relative">
															<Button
																type="button"
																size="icon"
																variant="destructive"
																onClick={() => form.setValue("logoUrl", "")}
																className="absolute top-1 right-1"
															>
																<X className="h-4 w-4" />
															</Button>
															<Image
																src={currentImageUrl}
																alt={form.watch("name") || "Брэндийн лого"}
																width={128}
																height={128}
																className="h-32 w-32 rounded-base border bg-background object-contain p-2"
															/>
														</div>
													) : (
														<div className="flex h-32 w-32 items-center justify-center rounded-base border-2 border-border border-dashed bg-background">
															<div className="text-center">
																<ImagePlaceholderIcon className="mx-auto h-8 w-8 text-foreground/60" />
																<p className="mt-1 text-foreground/60 text-xs">
																	Лого байршуулах
																</p>
															</div>
														</div>
													)}
													<UploadButton
														setValue={form.setValue}
														category="brand"
														targetName="logoUrl"
														label="Upload Pictures"
														variant="outline"
														size="sm"
													/>
												</div>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</CardContent>
					</Card>

					<div className="mt-1 flex justify-end">
						<SubmitButton
							isPending={form.formState.isSubmitting}
							className="w-full sm:w-auto"
							size="md"
						>
							{brand ? "Брэнд шинэчлэх" : "Брэнд нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default BrandForm;

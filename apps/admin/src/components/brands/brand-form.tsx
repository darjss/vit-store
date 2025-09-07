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
				<div className="space-y-4 sm:space-y-6">
					<Card className="overflow-hidden shadow-shadow">
						<CardContent className="p-4 sm:p-6">
							<h3 className="mb-4 font-bold text-base sm:text-lg">
								Брэндийн мэдээлэл
							</h3>
							<div className="space-y-4">
								<FormField
									control={form.control}
									name="name"
									render={({ field }) => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Брэндийн нэр
											</FormLabel>
											<FormControl>
												<Input
													placeholder="Брэндийн нэр оруулах"
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
									render={() => (
										<FormItem>
											<FormLabel className="text-sm sm:text-base">
												Лого зураг
											</FormLabel>
											<FormControl>
												<div className="space-y-3">
													{currentImageUrl ? (
														<div className="flex justify-center">
															<div className="relative">
																<Button
																	type="button"
																	size={"icon"}
																	variant="destructive"
																	onClick={() =>
																		form.setValue(
																			"logoUrl",
																			"https://www.placeholder.com/logo.png",
																		)
																	}
																	className="absolute top-0 right-0 p-0"
																>
																	<X />
																</Button>
																<Image
																	src={currentImageUrl}
																	alt={form.watch("name") || "Брэндийн лого"}
																	width={100}
																	height={100}
																	layout="constrained"
																	className="h-24 w-24 rounded-base border object-contain p-2"
																/>
															</div>
														</div>
													) : (
														<div className="flex justify-center">
															<div className="flex h-24 w-24 items-center justify-center rounded-base border-2 border-border border-dashed bg-secondary-background">
																<div className="text-center">
																	<ImagePlaceholderIcon className="mx-auto h-8 w-8 text-foreground/60" />
																	<p className="mt-1 text-foreground/60 text-xs">
																		Лого байршуулах
																	</p>
																</div>
															</div>
														</div>
													)}
													<div className="flex justify-center">
														<UploadButton
															setValue={form.setValue}
															category="brand"
														/>
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
							{brand ? "Брэнд шинэчлэх" : "Брэнд нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default BrandForm;

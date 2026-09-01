import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { addBrandSchema, type addBrandType } from "@vit/shared";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { ImagePlaceholderIcon } from "../icons";
import SubmitButton from "../submit-button";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { FormLoadingOverlay } from "../ui/form-loading-overlay";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { UploadButton } from "../upload-button";

const BrandForm = ({ brand, onSuccess }: { brand?: addBrandType; onSuccess: () => void }) => {
	const form = useForm({
		defaultValues: {
			bannerImage: brand?.bannerImage || "",
			description: brand?.description || "",
			logoUrl: brand?.logoUrl || "",
			name: brand?.name || "",
			seoDescription: brand?.seoDescription || "",
			seoTitle: brand?.seoTitle || "",
			slug: brand?.slug || "",
		},
		resolver: valibotResolver(addBrandSchema),
	});

	const queryClient = useQueryClient();
	const mutation = useMutation({
		...trpc.brands.addBrand.mutationOptions(),
		onError: (_error) => {
			toast.error("Брэнд шинэчлэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.brands.getAllBrands.queryOptions());
			onSuccess();
		},
	});
	const onSubmit = async (values: addBrandType) => {
		mutation.mutate(values);
	};

	const currentImageUrl = brand ? brand.logoUrl : form.watch("logoUrl");
	const bannerImageUrl = form.watch("bannerImage");

	return (
		<Form {...form}>
			<form className="relative" onSubmit={form.handleSubmit(onSubmit)}>
				<FormLoadingOverlay isLoading={form.formState.isSubmitting} />
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="text-xl font-semibold">Брэндийн мэдээлэл</h3>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Брэндийн нэр</FormLabel>
										<FormControl>
											<Input placeholder="Брэндийн нэр оруулах" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="slug"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Slug (хоосон бол автоматаар үүсгэнэ)</FormLabel>
										<FormControl>
											<Input placeholder="brand-name" {...field} />
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
										<FormLabel>Лого зураг</FormLabel>
										<FormControl>
											<div className="flex flex-col items-center space-y-4">
												{currentImageUrl ? (
													<div className="group relative">
														<Button
															className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
															onClick={() => form.setValue("logoUrl", "")}
															size="icon"
															type="button"
															variant="destructive"
														>
															<X className="h-3 w-3" />
														</Button>
														<Image
															alt={form.watch("name") || "Брэндийн лого"}
															className="border-border bg-background h-28 w-28 rounded-lg border-2 object-contain p-3 shadow-sm"
															height={120}
															layout="constrained"
															src={currentImageUrl}
															width={120}
														/>
													</div>
												) : (
													<div className="border-border bg-muted/30 flex h-28 w-28 items-center justify-center rounded-lg border-2 border-dashed">
														<div className="text-center">
															<ImagePlaceholderIcon className="text-muted-foreground mx-auto h-10 w-10" />
															<p className="text-muted-foreground mt-2 text-xs">Лого байршуулах</p>
														</div>
													</div>
												)}
												<UploadButton
													category="brand"
													onSuccess={(url) => form.setValue("logoUrl", url)}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="text-xl font-semibold">SEO ба баннер</h3>

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Тайлбар</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Брэндийн тайлбар..."
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="bannerImage"
								render={() => (
									<FormItem>
										<FormLabel>Баннер зураг</FormLabel>
										<FormControl>
											<div className="flex flex-col items-center space-y-4">
												{bannerImageUrl ? (
													<div className="group relative">
														<Button
															className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
															onClick={() => form.setValue("bannerImage", "")}
															size="icon"
															type="button"
															variant="destructive"
														>
															<X className="h-3 w-3" />
														</Button>
														<Image
															alt="Баннер"
															className="border-border bg-background h-24 w-full rounded-lg border-2 object-cover shadow-sm"
															height={120}
															layout="constrained"
															src={bannerImageUrl}
															width={400}
														/>
													</div>
												) : (
													<div className="border-border bg-muted/30 flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed">
														<div className="text-center">
															<ImagePlaceholderIcon className="text-muted-foreground mx-auto h-10 w-10" />
															<p className="text-muted-foreground mt-2 text-xs">
																Баннер байршуулах
															</p>
														</div>
													</div>
												)}
												<UploadButton
													category="brand"
													onSuccess={(url) => form.setValue("bannerImage", url)}
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="seoTitle"
								render={({ field }) => (
									<FormItem>
										<FormLabel>SEO гарчиг</FormLabel>
										<FormControl>
											<Input placeholder="SEO гарчиг..." {...field} value={field.value ?? ""} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="seoDescription"
								render={({ field }) => (
									<FormItem>
										<FormLabel>SEO тайлбар</FormLabel>
										<FormControl>
											<Textarea placeholder="SEO тайлбар..." {...field} value={field.value ?? ""} />
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
							isPending={form.formState.isSubmitting}
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

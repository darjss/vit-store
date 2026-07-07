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
import { Textarea } from "../ui/textarea";
import { UploadButton } from "../upload-button";

const BrandForm = ({
	brand,
	onSuccess,
}: {
	brand?: addBrandType;
	onSuccess: () => void;
}) => {
	const form = useForm({
		resolver: valibotResolver(addBrandSchema),
		defaultValues: {
			name: brand?.name || "",
			slug: brand?.slug || "",
			logoUrl: brand?.logoUrl || "",
			description: brand?.description || "",
			bannerImage: brand?.bannerImage || "",
			seoTitle: brand?.seoTitle || "",
			seoDescription: brand?.seoDescription || "",
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
		onError: (_error) => {
			toast.error("Брэнд шинэчлэхэд алдаа гарлаа");
		},
	});
	const onSubmit = async (values: addBrandType) => {
		mutation.mutate(values);
	};

	const currentImageUrl = brand ? brand.logoUrl : form.watch("logoUrl");
	const bannerImageUrl = form.watch("bannerImage");

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="relative">
				<FormLoadingOverlay isLoading={form.formState.isSubmitting} />
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="font-semibold text-xl">Брэндийн мэдээлэл</h3>
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
															type="button"
															size="icon"
															variant="destructive"
															onClick={() =>
																form.setValue(
																	"logoUrl",
																	"",
																)
															}
															className="-top-2 -right-2 absolute z-10 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
															>
																<X className="h-3 w-3" />
															</Button>
														<Image
																src={currentImageUrl}
																alt={form.watch("name") || "Брэндийн лого"}
																width={120}
																height={120}
																layout="constrained"
																className="h-28 w-28 rounded-lg border-2 border-border bg-background object-contain p-3 shadow-sm"
															/>
													</div>
												) : (
													<div className="flex h-28 w-28 items-center justify-center rounded-lg border-2 border-border border-dashed bg-muted/30">
														<div className="text-center">
															<ImagePlaceholderIcon className="mx-auto h-10 w-10 text-muted-foreground" />
															<p className="mt-2 text-muted-foreground text-xs">
																Лого байршуулах
															</p>
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
							<h3 className="font-semibold text-xl">SEO ба баннер</h3>

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
															type="button"
															size="icon"
															variant="destructive"
															onClick={() => form.setValue("bannerImage", "")}
															className="-top-2 -right-2 absolute z-10 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
															>
																<X className="h-3 w-3" />
															</Button>
														<Image
																src={bannerImageUrl}
																alt="Баннер"
																width={400}
																height={120}
																layout="constrained"
																className="h-24 w-full rounded-lg border-2 border-border bg-background object-cover shadow-sm"
															/>
													</div>
												) : (
													<div className="flex h-24 w-full items-center justify-center rounded-lg border-2 border-border border-dashed bg-muted/30">
														<div className="text-center">
															<ImagePlaceholderIcon className="mx-auto h-10 w-10 text-muted-foreground" />
															<p className="mt-2 text-muted-foreground text-xs">
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
											<Input
												placeholder="SEO гарчиг..."
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
								name="seoDescription"
								render={({ field }) => (
									<FormItem>
										<FormLabel>SEO тайлбар</FormLabel>
										<FormControl>
											<Textarea
												placeholder="SEO тайлбар..."
												{...field}
												value={field.value ?? ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<div className="flex justify-end">
						<SubmitButton
							isPending={form.formState.isSubmitting}
							className="w-full px-8 py-3 font-semibold text-lg transition-colors duration-300 hover:bg-primary/90 sm:w-auto"
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

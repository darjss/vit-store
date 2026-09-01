import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCategorySchema, type addCategoryType } from "@vit/shared";
import { X } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import SubmitButton from "../submit-button";
import { Card, CardContent } from "../ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { FormLoadingOverlay } from "../ui/form-loading-overlay";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { UploadButton } from "../upload-button";

const CategoryForm = ({
	category,
	onSuccess,
}: {
	category?: addCategoryType;
	onSuccess: () => void;
}) => {
	const form = useForm({
		defaultValues: {
			bannerImage: category?.bannerImage || "",
			description: category?.description || "",
			id: category?.id,
			name: category?.name || "",
			seoDescription: category?.seoDescription || "",
			seoTitle: category?.seoTitle || "",
			slug: category?.slug || "",
		},
		resolver: valibotResolver(addCategorySchema),
	});

	const queryClient = useQueryClient();
	const addMutation = useMutation({
		...trpc.category.addCategory.mutationOptions(),
		onError: () => {
			toast.error("Ангилал нэмэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.category.getAllCategories.queryOptions());
			onSuccess();
		},
	});

	const updateMutation = useMutation({
		...trpc.category.updateCategory.mutationOptions(),
		onError: () => {
			toast.error("Ангилал шинэчлэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			queryClient.invalidateQueries(trpc.category.getAllCategories.queryOptions());
			onSuccess();
		},
	});

	const onSubmit = async (values: addCategoryType) => {
		if (category?.id) {
			updateMutation.mutate({ id: category.id, ...values });
			return;
		}
		addMutation.mutate(values);
	};

	const bannerImageUrl = useWatch({ control: form.control, name: "bannerImage" });

	return (
		<Form {...form}>
			<form className="relative" onSubmit={form.handleSubmit(onSubmit)}>
				<FormLoadingOverlay isLoading={form.formState.isSubmitting} />
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="text-xl font-semibold">Ангиллын мэдээлэл</h3>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Ангиллын нэр</FormLabel>
										<FormControl>
											<Input placeholder="Ангиллын нэр оруулах" {...field} />
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
											<Input placeholder="category-name" {...field} />
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
												placeholder="Ангиллын тайлбар..."
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
														<button
															className="bg-destructive text-destructive-foreground absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100"
															onClick={() => form.setValue("bannerImage", "")}
															type="button"
														>
															<X className="h-3 w-3" />
														</button>
														<img
															alt="Баннер"
															className="border-border bg-background h-24 w-full rounded-lg border-2 object-cover shadow-sm"
															src={bannerImageUrl}
														/>
													</div>
												) : (
													<div className="border-border bg-muted/30 flex h-24 w-full items-center justify-center rounded-lg border-2 border-dashed">
														<p className="text-muted-foreground text-xs">Баннер байршуулах</p>
													</div>
												)}
												<UploadButton
													category="category"
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
							{category ? "Ангилал шинэчлэх" : "Ангилал нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default CategoryForm;

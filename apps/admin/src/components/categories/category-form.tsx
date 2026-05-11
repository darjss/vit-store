import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCategorySchema, type addCategoryType } from "@vit/shared";
import { X } from "lucide-react";
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
		resolver: valibotResolver(addCategorySchema),
		defaultValues: {
			id: category?.id,
			name: category?.name || "",
			slug: category?.slug || "",
			description: category?.description || "",
			bannerImage: category?.bannerImage || "",
			seoTitle: category?.seoTitle || "",
			seoDescription: category?.seoDescription || "",
		},
	});

	const queryClient = useQueryClient();
	const addMutation = useMutation({
		...trpc.category.addCategory.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(
				trpc.category.getAllCategories.queryOptions(),
			);
			onSuccess();
		},
		onError: () => {
			toast.error("Ангилал нэмэхэд алдаа гарлаа");
		},
	});

	const updateMutation = useMutation({
		...trpc.category.updateCategory.mutationOptions(),
		onSuccess: async () => {
			queryClient.invalidateQueries(
				trpc.category.getAllCategories.queryOptions(),
			);
			onSuccess();
		},
		onError: () => {
			toast.error("Ангилал шинэчлэхэд алдаа гарлаа");
		},
	});

	const onSubmit = async (values: addCategoryType) => {
		if (category?.id) {
			updateMutation.mutate({ id: category.id, ...values });
			return;
		}
		addMutation.mutate(values);
	};

	const bannerImageUrl = form.watch("bannerImage");

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)} className="relative">
				<FormLoadingOverlay isLoading={form.formState.isSubmitting} />
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="font-semibold text-xl">Ангиллын мэдээлэл</h3>
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
							<h3 className="font-semibold text-xl">SEO & Banner</h3>

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
										<FormLabel>Banner зураг</FormLabel>
										<FormControl>
											<div className="flex flex-col items-center space-y-4">
												{bannerImageUrl ? (
													<div className="group relative">
														<button
															type="button"
															className="-top-2 -right-2 absolute z-10 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
															onClick={() => form.setValue("bannerImage", "")}
														>
															<X className="h-3 w-3" />
														</button>
														<img
															src={bannerImageUrl}
															alt="Banner"
															className="h-24 w-full rounded-lg border-2 border-border bg-background object-cover shadow-sm"
														/>
													</div>
												) : (
													<div className="flex h-24 w-full items-center justify-center rounded-lg border-2 border-border border-dashed bg-muted/30">
														<p className="text-muted-foreground text-xs">
															Banner байршуулах
														</p>
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
										<FormLabel>SEO Title</FormLabel>
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
										<FormLabel>SEO Description</FormLabel>
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
							{category ? "Ангилал шинэчлэх" : "Ангилал нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default CategoryForm;

import { valibotResolver } from "@hookform/resolvers/valibot";
import {
	useMutation,
	useQueryClient,
	useSuspenseQueries,
} from "@tanstack/react-query";
import {
	type AIExtractedData,
	addProductSchema,
	getAiProductFormValues,
	getProductFormDefaults,
	type ProductFormProduct,
	type ProductFormValues,
	status,
} from "@vit/shared/domain/product";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import SubmitButton from "@/components/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ProductAdvancedSection } from "./sections/product-advanced-section";
import { ProductImagesSection } from "./sections/product-images-section";

const ProductForm = ({
	product,
	aiData,
	onSuccess,
	showAIFields = false,
}: {
	product?: ProductFormProduct;
	aiData?: AIExtractedData;
	onSuccess: () => void;
	showAIFields?: boolean;
}) => {
	const [{ data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});

	const [showAdvancedFields, setShowAdvancedFields] = useState(showAIFields);

	const form = useForm<ProductFormValues, undefined, ProductFormValues>({
		resolver: valibotResolver(addProductSchema, undefined, { raw: true }),
		defaultValues: getProductFormDefaults(product, aiData, brands ?? []),
	});

	useEffect(() => {
		if (aiData) {
			form.reset(getAiProductFormValues(form.getValues(), aiData, brands ?? []));
			setShowAdvancedFields(true);
		}
	}, [aiData, brands, form.getValues, form.reset]);

	const queryClient = useQueryClient();
	const mutation = useMutation({
		...trpc.product.addProduct.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
			onSuccess();
		},
		onError: (_error) => {
			toast.error("Failed to add product");
		},
	});

	const { fields, append, remove } = useFieldArray({
		control: form.control,
		name: "images",
	});

	const handleRemove = (index: number) => {
		if (fields.length > 1) {
			remove(index);
		} else {
			form.setValue(`images.${index}.url`, "");
		}
	};

	const onSubmit = async (values: ProductFormValues) => {
		mutation.mutate({
			...values,
			expirationDate: values.expirationDate || "",
		});
	};

	const currentImageUrl = form.watch("images");

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<Card className="overflow-auto bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-4 p-6">
							<h3 className="mb-4 font-semibold text-xl">
								Бүтээгдэхүүний дэлгэрэнгүй
							</h3>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Бүтээгдэхүүний нэр (EN)</FormLabel>
										<FormControl>
											<Input
												placeholder="Бүтээгдэхүүний нэр оруулах"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{showAdvancedFields && (
								<FormField
									control={form.control}
									name="name_mn"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Бүтээгдэхүүний нэр (MN)</FormLabel>
											<FormControl>
												<Input
													placeholder="Монгол нэр"
													{...field}
													value={field.value || ""}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}

							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Бүтээгдэхүүний тайлбар</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Бүтээгдэхүүний тайлбар оруулах"
												{...field}
												className="h-32 resize-none"
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="brandId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Брэнд</FormLabel>
										<Select
											onValueChange={(value) => field.onChange(value)}
											defaultValue={field.value?.toString()}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Брэнд сонгох" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{brands.length > 0 &&
													brands.map((brand) => (
														<SelectItem
															key={brand.id}
															value={brand.id.toString()}
														>
															{brand.name}
														</SelectItem>
													))}
												{brands.length === 0 && <div>Брэнд байхгүй</div>}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="categoryId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Ангилал</FormLabel>
										<Select
											onValueChange={(value) => field.onChange(value)}
											defaultValue={field.value?.toString()}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder="Ангилал сонгох" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{categories.length > 0 &&
													categories.map((category) => (
														<SelectItem
															key={category.id}
															value={category.id.toString()}
														>
															{category.name}
														</SelectItem>
													))}
												{categories.length === 0 && <div>Ангилал байхгүй</div>}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="status"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Төлөв</FormLabel>
										<Select
											onValueChange={field.onChange}
											defaultValue={field.value || status[0]}
										>
											<FormControl>
												<SelectTrigger>
													<SelectValue>{field.value}</SelectValue>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{status.map((statusOption) => (
													<SelectItem key={statusOption} value={statusOption}>
														{statusOption}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-4 p-6">
							<h3 className="mb-4 font-semibold text-xl">Үнэ ба үлдэгдэл</h3>
							<FormField
								control={form.control}
								name="price"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Бүтээгдэхүүний үнэ</FormLabel>
										<FormControl>
											<Input
												type="number"
												step={1000}
												placeholder="Үнэ оруулах"
												{...field}
												onChange={(e) =>
													field.onChange(Number.parseFloat(e.target.value))
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="stock"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Бүтээгдэхүүний үлдэгдэл</FormLabel>
										<FormControl>
											<Input
												type="number"
												placeholder="үлдэгдэлийн тоо оруулах"
												{...field}
												onChange={(e) =>
													field.onChange(Number.parseInt(e.target.value, 10))
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="expirationDate"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Дуусах хугацаа (сар/жил)</FormLabel>
										<FormControl>
											<Input
												type="month"
												{...field}
												value={field.value || ""}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="potency"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Бүтээгдэхүүний хүч</FormLabel>
										<FormControl>
											<Input placeholder="Жишээ нь: 100mg" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="amount"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Бүтээгдэхүүний хэмжээ</FormLabel>
										<FormControl>
											<Input placeholder="Жишээ нь: 30 капсул" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="dailyIntake"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Өдөрт хэрэглэх хэмжээ</FormLabel>
										<FormControl>
											<Input
												type="number"
												placeholder="Өдөрт хэрэглэх хэмжээ оруулах"
												{...field}
												onChange={(e) =>
													field.onChange(Number.parseInt(e.target.value, 10))
												}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							{showAdvancedFields && (
								<FormField
									control={form.control}
									name="weightGrams"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Жин (грамм)</FormLabel>
											<FormControl>
												<Input
													type="number"
													placeholder="Жин оруулах"
													{...field}
													value={field.value || 0}
													onChange={(e) =>
														field.onChange(Number.parseInt(e.target.value, 10))
													}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							)}
						</CardContent>
					</Card>

					<ProductImagesSection
						images={currentImageUrl}
						onRemove={handleRemove}
						append={append}
					/>

					<ProductAdvancedSection
						form={form}
						show={showAdvancedFields}
						onToggle={() => setShowAdvancedFields((show) => !show)}
					/>

					<div className="mt-6 flex justify-end lg:col-span-2">
						<SubmitButton
							isPending={form.formState.isSubmitting || mutation.isPending}
							className="w-full px-8 py-3 font-semibold text-lg transition-colors duration-300 hover:bg-primary/90 sm:w-auto"
						>
							Бүтээгдэхүүн нэмэх
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default ProductForm;

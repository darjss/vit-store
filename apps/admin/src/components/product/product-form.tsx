import { valibotResolver } from "@hookform/resolvers/valibot";
import {
	useMutation,
	useQueryClient,
	useSuspenseQueries,
} from "@tanstack/react-query";
import { Image } from "@unpic/react";
import {
	type AIExtractedData,
	addProductSchema,
	findBrandId,
	type ProductFormValues,
	status,
} from "@vit/shared";
import { ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Textarea } from "../ui/textarea";
import { UploadButton } from "../upload-button";
import { ArrayInput, TagsInput } from "./array-input";

export type { AIExtractedData } from "@vit/shared";

const TAG_SUGGESTIONS = [
	"витамин",
	"эрүүл мэнд",
	"дархлаа",
	"эрчим хүч",
	"унтлага",
	"стресс",
	"булчин",
	"үе мөч",
	"арьс үс",
	"хоол боловсруулалт",
	"зүрх судас",
	"тархи",
	"нүд",
	"яс",
	"төмөр",
	"омега",
	"пробиотик",
	"коллаген",
	"протеин",
	"эмэгтэй",
	"эрэгтэй",
	"хүүхэд",
];

const ProductForm = ({
	product,
	aiData,
	onSuccess,
	showAIFields = false,
}: {
	product?: ProductFormValues;
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

	const form = useForm<ProductFormValues>({
		resolver: valibotResolver(addProductSchema),
		defaultValues: {
			name: aiData?.name || product?.name || "",
			description: aiData?.description || product?.description || "",
			dailyIntake: aiData?.dailyIntake || product?.dailyIntake || 1,
			brandId: aiData?.brand
				? String(findBrandId(aiData.brand, brands ?? []))
				: product?.brandId || "",
			categoryId: product?.categoryId || "",
			amount: aiData?.amount || product?.amount || "",
			potency: aiData?.potency || product?.potency || "",
			status: product?.status || "draft",
			stock: product?.stock || 0,
			price: product?.price || 0,
			images: aiData?.images || product?.images || [],
			name_mn: aiData?.name_mn || product?.name_mn || "",
			ingredients: aiData?.ingredients || product?.ingredients || [],
			tags: aiData?.tags || product?.tags || [],
			seoTitle: aiData?.seoTitle || product?.seoTitle || "",
			seoDescription: aiData?.seoDescription || product?.seoDescription || "",
			weightGrams: aiData?.weightGrams || product?.weightGrams || 0,
		},
	});

	useEffect(() => {
		if (aiData) {
			form.reset({
				...form.getValues(),
				name: aiData.name,
				description: aiData.description,
				dailyIntake: aiData.dailyIntake || 1,
				brandId: String(findBrandId(aiData.brand, brands ?? [])),
				amount: aiData.amount,
				potency: aiData.potency,
				images: aiData.images,
				name_mn: aiData.name_mn || "",
				ingredients: aiData.ingredients || [],
				tags: aiData.tags || [],
				seoTitle: aiData.seoTitle || "",
				seoDescription: aiData.seoDescription || "",
				weightGrams: aiData.weightGrams || 0,
			});
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
		mutation.mutate(values as any);
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

					<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg md:col-span-2">
						<CardContent className="space-y-4 p-6">
							<h3 className="mb-4 font-semibold text-xl">
								Бүтээгдэхүүний зураг
							</h3>
							{currentImageUrl.length > 0 && (
								<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
									{currentImageUrl.map((image, i) => (
										<div
											key={`${image.url}-${i}`}
											className="group relative aspect-square overflow-hidden border-2 border-border bg-muted"
										>
											<Button
												type="button"
												variant="destructive"
												size="icon"
												onClick={() => handleRemove(i)}
												className="absolute top-2 right-2 z-10 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100"
												aria-label="Remove image"
											>
												<X className="h-4 w-4" />
											</Button>
											<Image
												src={image.url}
												alt={`product image ${i + 1}`}
												width={400}
												height={400}
												className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
											/>
											{i === 0 && (
												<div className="absolute bottom-0 left-0 bg-primary px-2 py-0.5 font-bold text-primary-foreground text-xs">
													Үндсэн
												</div>
											)}
										</div>
									))}
								</div>
							)}
							<UploadButton
								append={append}
								category="product"
								onSuccess={() => {}}
							/>
						</CardContent>
					</Card>

					<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg md:col-span-2">
						<CardContent className="space-y-4 p-6">
							<button
								type="button"
								onClick={() => setShowAdvancedFields(!showAdvancedFields)}
								className="flex w-full items-center justify-between"
							>
								<div className="flex items-center gap-2">
									<Sparkles className="h-5 w-5 text-primary" />
									<h3 className="font-semibold text-xl">
										Нэмэлт мэдээлэл (AI)
									</h3>
								</div>
								{showAdvancedFields ? (
									<ChevronUp className="h-5 w-5" />
								) : (
									<ChevronDown className="h-5 w-5" />
								)}
							</button>

							{showAdvancedFields && (
								<div className="grid gap-4 pt-4 md:grid-cols-2">
									<div className="md:col-span-2">
										<ArrayInput
											form={form}
											name="ingredients"
											label="Найрлага"
											placeholder="Найрлага нэмэх..."
										/>
									</div>

									<div className="md:col-span-2">
										<TagsInput
											form={form}
											name="tags"
											label="Таг"
											placeholder="Таг нэмэх..."
											suggestions={TAG_SUGGESTIONS}
										/>
									</div>

									<FormField
										control={form.control}
										name="seoTitle"
										render={({ field }) => (
											<FormItem>
												<FormLabel>SEO Гарчиг</FormLabel>
												<FormControl>
													<Input
														placeholder="SEO гарчиг (60 тэмдэгт хүртэл)"
														{...field}
														value={field.value || ""}
													/>
												</FormControl>
												<FormMessage />
												<p className="text-muted-foreground text-xs">
													{(field.value || "").length} / 60
												</p>
											</FormItem>
										)}
									/>

									<FormField
										control={form.control}
										name="seoDescription"
										render={({ field }) => (
											<FormItem>
												<FormLabel>SEO Тайлбар</FormLabel>
												<FormControl>
													<Textarea
														placeholder="SEO тайлбар (160 тэмдэгт хүртэл)"
														{...field}
														value={field.value || ""}
														className="h-20 resize-none"
													/>
												</FormControl>
												<FormMessage />
												<p className="text-muted-foreground text-xs">
													{(field.value || "").length} / 160
												</p>
											</FormItem>
										)}
									/>
								</div>
							)}
						</CardContent>
					</Card>

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

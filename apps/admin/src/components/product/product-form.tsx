import { valibotResolver } from "@hookform/resolvers/valibot";
import { addProductSchema, type addProductType } from "@vit-store/shared";
import {
	useMutation,
	useQueryClient,
	useSuspenseQueries,
} from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { X } from "lucide-react";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { status } from "@vit-store/shared/constants";
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

const ProductForm = ({
	product,
	onSuccess,
}: {
	product?: addProductType;
	onSuccess: () => void;
}) => {
	const [{ data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});
	const form = useForm({
		resolver: valibotResolver(addProductSchema),
		defaultValues: {
			name: product?.name || "",
			description: product?.description || "",
			dailyIntake: product?.dailyIntake || 0,
			brandId: product?.brandId || 0,
			categoryId: product?.categoryId || 0,
			amount: product?.amount || "",
			potency: product?.potency || "",
			status: product?.status || "active",
			stock: product?.stock || 0,
			price: product?.price || 0,
			images: product?.images || [],
		},
	});

	const queryClient = useQueryClient();
	const mutation = useMutation({
		...trpc.product.addProduct.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
			onSuccess();
		},
		onError: (error) => {
			console.error("error", error);
			toast.error("Failed to update brand");
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

	const onSubmit = async (values: addProductType) => {
		console.log("submitting values", values);
		mutation.mutate(values);
	};

	const currentImageUrl = product ? product.images : form.watch("images");

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
										<FormLabel>Бүтээгдэхүүний нэр</FormLabel>
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
												className="h-20 resize-none"
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
										<Select onValueChange={field.onChange}>
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
										<Select onValueChange={field.onChange}>
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
												step={0.01}
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
											key={image.id}
											className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
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
										</div>
									))}
								</div>
							)}
							<UploadButton append={append} category="product" />
						</CardContent>
					</Card>

					<div className="mt-6 flex justify-end lg:col-span-2">
						<SubmitButton
							isPending={form.formState.isSubmitting}
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

import { status, type ProductFormValues } from "@vit/shared/domain/product";
import type { UseFormReturn } from "react-hook-form";
import { Card, CardContent } from "@/components/ui/card";
import { productStatusLabel } from "@/lib/enum-labels";
import {
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

type ProductOption = { id: number; name: string };

type ProductDetailsSectionProps = {
	form: UseFormReturn<ProductFormValues, undefined, ProductFormValues>;
	brands: ProductOption[];
	categories: ProductOption[];
	showAdvancedFields: boolean;
};

export function ProductDetailsSection({
	form,
	brands,
	categories,
	showAdvancedFields,
}: ProductDetailsSectionProps) {
	return (
		<>
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
													<SelectValue>
														{productStatusLabel[
															field.value as keyof typeof productStatusLabel
														] ?? field.value}
													</SelectValue>
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{status.map((statusOption) => (
													<SelectItem key={statusOption} value={statusOption}>
														{productStatusLabel[statusOption]}
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
		</>
	);
}

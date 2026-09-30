import { productTagSuggestions, type ProductFormValues } from "@vit/shared/domain/product";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { ArrayInput, TagsInput } from "@/components/product/array-input";
import { Card, CardContent } from "@/components/ui/card";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProductAdvancedSectionProps = {
	form: UseFormReturn<ProductFormValues, undefined, ProductFormValues>;
	onToggle: () => void;
	show: boolean;
};

export function ProductAdvancedSection({ form, onToggle, show }: ProductAdvancedSectionProps) {
	return (
		<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg md:col-span-2">
			<CardContent className="space-y-4 p-6">
				<button
					className="flex w-full items-center justify-between"
					onClick={onToggle}
					type="button"
				>
					<div className="flex items-center gap-2">
						<Sparkles className="text-primary h-5 w-5" />
						<h3 className="text-xl font-semibold">Нэмэлт мэдээлэл (AI)</h3>
					</div>
					{show ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
				</button>

				{show && (
					<div className="grid gap-4 pt-4 md:grid-cols-2">
						<div className="md:col-span-2">
							<ArrayInput
								form={form}
								label="Найрлага"
								name="ingredients"
								placeholder="Найрлага нэмэх..."
							/>
						</div>

						<div className="md:col-span-2">
							<TagsInput
								form={form}
								label="Таг"
								name="tags"
								placeholder="Таг нэмэх..."
								suggestions={[...productTagSuggestions]}
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
									<p className="text-muted-foreground text-xs">{(field.value || "").length} / 60</p>
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
											className="h-20 resize-none"
											value={field.value || ""}
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
	);
}

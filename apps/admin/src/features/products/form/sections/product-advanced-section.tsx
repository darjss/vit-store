import { productTagSuggestions, type ProductFormValues } from "@vit/shared/domain/product";
import { ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { ArrayInput, TagsInput } from "@/components/product/array-input";
import { Card, CardContent } from "@/components/ui/card";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type ProductAdvancedSectionProps = {
	form: UseFormReturn<ProductFormValues, undefined, ProductFormValues>;
	show: boolean;
	onToggle: () => void;
};

export function ProductAdvancedSection({
	form,
	show,
	onToggle,
}: ProductAdvancedSectionProps) {
	return (
		<Card className="bg-transparent shadow-md transition-shadow duration-300 hover:shadow-lg md:col-span-2">
			<CardContent className="space-y-4 p-6">
				<button
					type="button"
					onClick={onToggle}
					className="flex w-full items-center justify-between"
				>
					<div className="flex items-center gap-2">
						<Sparkles className="h-5 w-5 text-primary" />
						<h3 className="font-semibold text-xl">Нэмэлт мэдээлэл (AI)</h3>
					</div>
					{show ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
				</button>

				{show && (
					<div className="grid gap-4 pt-4 md:grid-cols-2">
						<div className="md:col-span-2">
							<ArrayInput form={form} name="ingredients" label="Найрлага" placeholder="Найрлага нэмэх..." />
						</div>

						<div className="md:col-span-2">
							<TagsInput
								form={form}
								name="tags"
								label="Таг"
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
										<Input placeholder="SEO гарчиг (60 тэмдэгт хүртэл)" {...field} value={field.value || ""} />
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
											value={field.value || ""}
											className="h-20 resize-none"
										/>
									</FormControl>
									<FormMessage />
									<p className="text-muted-foreground text-xs">{(field.value || "").length} / 160</p>
								</FormItem>
							)}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addCategorySchema, type addCategoryType } from "@vit/shared";
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
import { Input } from "../ui/input";

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
			updateMutation.mutate({ id: category.id, name: values.name });
			return;
		}
		addMutation.mutate({ name: values.name });
	};

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
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

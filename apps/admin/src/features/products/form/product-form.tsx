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
import { Form } from "@/components/ui/form";
import { ProductAdvancedSection } from "./sections/product-advanced-section";
import { ProductDetailsSection } from "./sections/product-details-section";
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
					<ProductDetailsSection
						form={form}
						brands={brands}
						categories={categories}
						showAdvancedFields={showAdvancedFields}
					/>

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

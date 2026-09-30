import { valibotResolver } from "@hookform/resolvers/valibot";
import { useMutation, useQueryClient, useSuspenseQueries } from "@tanstack/react-query";
import {
	type AIExtractedData,
	addProductSchema,
	getAiProductFormValues,
	getProductFormDefaults,
	type ProductFormProduct,
	type ProductFormValues,
} from "@vit/shared/domain/product";
import { useEffect, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { invalidateProductCaches } from "@/utils/product-cache";
import { trpc } from "@/utils/trpc";
import SubmitButton from "@/components/submit-button";
import { Form } from "@/components/ui/form";
import { FormLoadingOverlay } from "@/components/ui/form-loading-overlay";
import { ProductAdvancedSection } from "./sections/product-advanced-section";
import { ProductDetailsSection } from "./sections/product-details-section";
import { ProductImagesSection } from "./sections/product-images-section";

const ProductForm = ({
	aiData,
	onSuccess,
	product,
	showAIFields = false,
}: {
	aiData?: AIExtractedData;
	onSuccess: () => void;
	product?: ProductFormProduct;
	showAIFields?: boolean;
}) => {
	const [{ data: categories }, { data: brands }] = useSuspenseQueries({
		queries: [
			trpc.category.getAllCategories.queryOptions(),
			trpc.brands.getAllBrands.queryOptions(),
		],
	});

	const [showAdvancedFields, setShowAdvancedFields] = useState(showAIFields);
	const [seededAiData, setSeededAiData] = useState(aiData);
	if (aiData && aiData !== seededAiData) {
		setSeededAiData(aiData);
		setShowAdvancedFields(true);
	}

	const form = useForm<ProductFormValues, undefined, ProductFormValues>({
		defaultValues: getProductFormDefaults(product, aiData, brands ?? []),
		resolver: valibotResolver(addProductSchema, undefined, { raw: true }),
	});

	useEffect(() => {
		if (!aiData) {
			return;
		}
		form.reset(getAiProductFormValues(form.getValues(), aiData, brands ?? []));
	}, [aiData, brands, form]);

	const queryClient = useQueryClient();
	const productId = product?.id;
	const isEditing = productId !== undefined;

	const addMutation = useMutation({
		...trpc.product.addProduct.mutationOptions(),
		onError: (_error) => {
			toast.error("Бүтээгдэхүүн нэмэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			form.reset();
			await invalidateProductCaches(queryClient);
			onSuccess();
		},
	});

	const updateMutation = useMutation({
		...trpc.product.updateProduct.mutationOptions(),
		onError: (_error) => {
			toast.error("Бүтээгдэхүүн шинэчлэхэд алдаа гарлаа");
		},
		onSuccess: async () => {
			await invalidateProductCaches(queryClient, productId);
			onSuccess();
		},
	});

	const mutation = isEditing ? updateMutation : addMutation;

	const { append, fields, remove } = useFieldArray({
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
		if (productId !== undefined) {
			updateMutation.mutate({
				...values,
				expirationDate: values.expirationDate || "",
				id: productId,
			});
		} else {
			addMutation.mutate({
				...values,
				expirationDate: values.expirationDate || "",
			});
		}
	};

	const currentImageUrl = useWatch({ control: form.control, name: "images" });

	return (
		<Form {...form}>
			<form className="relative" onSubmit={form.handleSubmit(onSubmit)}>
				<FormLoadingOverlay isLoading={form.formState.isSubmitting || mutation.isPending} />
				<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
					<ProductDetailsSection
						brands={brands}
						categories={categories}
						form={form}
						showAdvancedFields={showAdvancedFields}
					/>

					<ProductImagesSection append={append} images={currentImageUrl} onRemove={handleRemove} />

					<ProductAdvancedSection
						form={form}
						onToggle={() => setShowAdvancedFields((show) => !show)}
						show={showAdvancedFields}
					/>

					<div className="mt-6 flex justify-end lg:col-span-2">
						<SubmitButton
							className="hover:bg-primary/90 w-full px-8 py-3 text-lg font-semibold transition-colors duration-300 sm:w-auto"
							isPending={form.formState.isSubmitting || mutation.isPending}
						>
							{isEditing ? "Шинэчлэх" : "Бүтээгдэхүүн нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default ProductForm;

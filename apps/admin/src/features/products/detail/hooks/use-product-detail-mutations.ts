import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
	addImageMutationOptions,
	deleteImageMutationOptions,
	deleteProductMutationOptions,
	regenerateProductImagesMutationOptions,
	setPrimaryImageMutationOptions,
	updateProductFieldMutationOptions,
} from "@/lib/admin-result-options";
import {
	presentAiError,
	presentCatalogError,
	showErrorPresentation,
} from "@/lib/error-presentations";
import { handleResult } from "@/lib/handle-result";
import { trpc } from "@/utils/trpc";

export function useProductDetailMutations(
	productId: number,
	options?: { onRegenerateSuccess?: () => void },
) {
	const queryClient = useQueryClient();
	const invalidateProduct = () =>
		queryClient.invalidateQueries(
			trpc.product.getProductById.queryOptions({ id: productId }),
		);

	const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
		...deleteProductMutationOptions,
		onSuccess: (result) =>
			handleResult(
				result,
				() => {
					void queryClient.invalidateQueries({
						queryKey: ["admin-products-infinite"],
						type: "all",
					});
					void queryClient.invalidateQueries(
						trpc.product.getAllProducts.queryOptions(),
					);
				},
				presentCatalogError,
			),
	});

	const updateFieldMutation = useMutation(updateProductFieldMutationOptions);
	const updateProductField = async (
		input: Parameters<typeof updateFieldMutation.mutateAsync>[0],
	) => {
		const result = await updateFieldMutation.mutateAsync(input);
		return result.match({
			ok: () => {
				void invalidateProduct();
				void queryClient.invalidateQueries({
					queryKey: ["admin-products-infinite"],
					type: "all",
				});
				return true;
			},
			err: (error) => {
				showErrorPresentation(presentCatalogError(error));
				return false;
			},
		});
	};

	const { mutate: deleteImage, isPending: isDeleteImagePending } = useMutation({
		...deleteImageMutationOptions,
		onSuccess: (result) =>
			handleResult(result, () => void invalidateProduct(), presentCatalogError),
	});

	const { mutate: addImage } = useMutation({
		...addImageMutationOptions,
		onSuccess: (result) =>
			handleResult(result, () => void invalidateProduct(), presentCatalogError),
	});

	const {
		mutate: regenerateProductImages,
		isPending: isRegenerateProductImagesPending,
	} = useMutation({
		...regenerateProductImagesMutationOptions,
		onSuccess: (result) =>
			handleResult(
				result,
				({ count }) => {
					options?.onRegenerateSuccess?.();
					void invalidateProduct();
					toast.success(`AI зураг амжилттай шинэчлэгдлээ (${count})`);
				},
				presentAiError,
			),
	});

	const { mutate: setPrimaryImage, isPending: isSetPrimaryImagePending } =
		useMutation({
			...setPrimaryImageMutationOptions,
			onSuccess: (result) =>
				handleResult(
					result,
					() => void invalidateProduct(),
					presentCatalogError,
				),
		});

	const deleteHelper = async (id: number) => {
		deleteProduct({ id });
	};

	return {
		deleteProduct,
		isDeletePending,
		updateProductField,
		isUpdateProductFieldPending: updateFieldMutation.isPending,
		deleteImage,
		isDeleteImagePending,
		addImage,
		regenerateProductImages,
		isRegenerateProductImagesPending,
		setPrimaryImage,
		isSetPrimaryImagePending,
		deleteHelper,
	};
}

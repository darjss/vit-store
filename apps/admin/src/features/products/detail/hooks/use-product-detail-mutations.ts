import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { invalidateProductCaches } from "@/utils/product-cache";
import { trpc } from "@/utils/trpc";

export function useProductDetailMutations(
	productId: number,
	options?: { onRegenerateSuccess?: () => void },
) {
	const queryClient = useQueryClient();

	const { isPending: isDeletePending, mutate: deleteProduct } = useMutation({
		...trpc.product.deleteProduct.mutationOptions(),
		onSuccess: () => {
			invalidateProductCaches(queryClient);
		},
	});

	const { isPending: isUpdateProductFieldPending, mutateAsync: updateProductField } = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onError: (error) => {
			toast.error(error.message || "Талбар шинэчлэхэд алдаа гарлаа");
		},
		onSuccess: () => {
			invalidateProductCaches(queryClient, productId);
		},
	});

	const { isPending: isDeleteImagePending, mutate: deleteImage } = useMutation({
		...trpc.image.deleteImage.mutationOptions(),
		onSuccess: () => {
			invalidateProductCaches(queryClient, productId);
		},
	});

	const { mutate: addImage } = useMutation({
		...trpc.image.addImage.mutationOptions(),
		onSuccess: () => {
			invalidateProductCaches(queryClient, productId);
		},
	});

	const { isPending: isRegenerateProductImagesPending, mutate: regenerateProductImages } =
		useMutation({
			...trpc.aiProduct.regenerateProductImages.mutationOptions(),
			onError: (error, variables) => {
				console.error("aiProduct.regenerateProductImages.error", {
					error,
					productId: variables.productId,
					query: variables.query,
				});
				toast.error(error.message || "AI зураг татах үед алдаа гарлаа");
			},
			onSuccess: (result) => {
				options?.onRegenerateSuccess?.();
				invalidateProductCaches(queryClient, productId);

				if (result.count > 0) {
					toast.success(`AI зураг амжилттай шинэчлэгдлээ (${result.count})`);
				} else {
					toast.warning("AI зураг олдсонгүй. Query-г шалгаад дахин оролдоно уу.");
				}
			},
		});

	const { isPending: isSetPrimaryImagePending, mutate: setPrimaryImage } = useMutation({
		...trpc.image.setPrimaryImage.mutationOptions(),
		onSuccess: () => {
			invalidateProductCaches(queryClient, productId);
		},
	});

	return {
		addImage,
		deleteImage,
		deleteProduct,
		isDeleteImagePending,
		isDeletePending,
		isRegenerateProductImagesPending,
		isSetPrimaryImagePending,
		isUpdateProductFieldPending,
		regenerateProductImages,
		setPrimaryImage,
		updateProductField,
	};
}

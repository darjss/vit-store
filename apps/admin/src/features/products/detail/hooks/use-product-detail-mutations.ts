import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";

export function useProductDetailMutations(
	productId: number,
	options?: { onRegenerateSuccess?: () => void },
) {
	const queryClient = useQueryClient();

	const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
		...trpc.product.deleteProduct.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: ["admin-products-infinite"],
				type: "all",
			});
			queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
		},
	});

	const {
		mutateAsync: updateProductField,
		isPending: isUpdateProductFieldPending,
	} = useMutation({
		...trpc.product.updateProductField.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);
			queryClient.invalidateQueries({
				queryKey: ["admin-products-infinite"],
				type: "all",
			});
		},
		onError: (error) => {
			toast.error(error.message || "Талбар шинэчлэхэд алдаа гарлаа");
		},
	});

	const { mutate: deleteImage, isPending: isDeleteImagePending } = useMutation({
		...trpc.image.deleteImage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);
		},
	});

	const { mutate: addImage } = useMutation({
		...trpc.image.addImage.mutationOptions(),
		onSuccess: () => {
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);
		},
	});

	const {
		mutate: regenerateProductImages,
		isPending: isRegenerateProductImagesPending,
	} = useMutation({
		...trpc.aiProduct.regenerateProductImages.mutationOptions(),
		onSuccess: (result) => {
			options?.onRegenerateSuccess?.();
			queryClient.invalidateQueries(
				trpc.product.getProductById.queryOptions({ id: productId }),
			);

			if (result.count > 0) {
				toast.success(`AI зураг амжилттай шинэчлэгдлээ (${result.count})`);
			} else {
				toast.warning("AI зураг олдсонгүй. Query-г шалгаад дахин оролдоно уу.");
			}
		},
		onError: (error, variables) => {
			console.error("aiProduct.regenerateProductImages.error", {
				productId: variables.productId,
				query: variables.query,
				error,
			});
			toast.error(error.message || "AI зураг татах үед алдаа гарлаа");
		},
	});

	const { mutate: setPrimaryImage, isPending: isSetPrimaryImagePending } =
		useMutation({
			...trpc.image.setPrimaryImage.mutationOptions(),
			onSuccess: () => {
				queryClient.invalidateQueries(
					trpc.product.getProductById.queryOptions({ id: productId }),
				);
			},
		});

	const deleteHelper = async (id: number) => {
		deleteProduct({ id });
	};

	return {
		deleteProduct,
		isDeletePending,
		updateProductField,
		isUpdateProductFieldPending,
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

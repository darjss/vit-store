import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import ProductForm from "@/components/product/product-form";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_dash/products/add")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  return (
    <div className="space-y-4">
      <ProductForm
        onSuccess={() => {
          toast.success("Product added successfully");
          queryClient.invalidateQueries(
            trpc.product.getPaginatedProducts.queryOptions({}),
          );
          navigate({ to: "/products" });
        }}
      />
    </div>
  );
}

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Calendar,
  Check,
  DollarSign,
  Eye,
  Image as ImageIcon,
  Loader2,
  Package,
  Phone,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";
import { EditableField } from "@/components/editable-field";
import ProductForm from "@/components/product/product-form";
import RowAction from "@/components/row-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LineChart } from "@/components/ui/line-chart";
import { UploadButton } from "@/components/upload-button";
import { formatCurrency, formatDateToText, getStatusColor } from "@/lib/utils";
import { trpc } from "@/utils/trpc";
import { z } from "zod";

export const Route = createFileRoute("/_dash/products/$id")({
  component: RouteComponent,
  loader: async ({ context: ctx, params }) => {
    const product = await ctx.queryClient.ensureQueryData(
      ctx.trpc.product.getProductById.queryOptions({ id: Number(params.id) }),
    );
    return { product };
  },
  params: z.object({
    id: z.coerce.number(),
  }),
});

function RouteComponent() {
  const { id: productId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data: product } = useSuspenseQuery({
    ...trpc.product.getProductById.queryOptions({ id: productId }),
  });
  const {data: orders}=useSuspenseQuery({
    ...trpc.order.getRecentOrdersByProductId.queryOptions({productId:productId})
  })
  const { mutate: deleteProduct, isPending: isDeletePending } = useMutation({
    ...trpc.product.deleteProduct.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.product.getAllProducts.queryOptions());
    },
  });
  const { mutate: updateProductField, isPending: isUpdateProductFieldPending } =
    useMutation({
      ...trpc.product.updateProductField.mutationOptions(),
      onSuccess: () => {
        queryClient.invalidateQueries(
          trpc.product.getProductById.queryOptions({ id: productId }),
        );
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

  return (
    <>
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>Бүтээгдэхүүний дэлгэрэнгүй</DialogTitle>
            <DialogDescription>
              Бүтээгдэхүүний дэлгэрэнгүй мэдээлэл
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
            <ProductForm
              product={product}
              onSuccess={() => {
                setIsEditDialogOpen(false);
                queryClient.invalidateQueries(
                  trpc.product.getAllProducts.queryOptions(),
                );
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <div className="min-h-screen bg-transparent p-2 sm:p-4 md:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-none">
          <div className="mb-4 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={() => navigate({ to: "/products" })}
                className="rounded-lg p-2 transition-colors hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="font-heading text-xl sm:text-2xl md:text-3xl">
                  Бүтээгдэхүүний дэлгэрэнгүй
                </h1>
                <p className="text-muted-foreground text-xs sm:text-sm md:text-base">
                  {product.slug}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <EditableField
                label=""
                type="select"
                value={product.status}
                options={[
                  { value: "active", label: "Идэвхтэй" },
                  { value: "draft", label: "Ноорог" },
                  { value: "out_of_stock", label: "Дууссан" },
                ]}
                className={`rounded-full border px-3 py-1 font-medium text-sm ${getStatusColor(product.status)}`}
                isLoading={isUpdateProductFieldPending}
                onSave={(next) =>
                  updateProductField({
                    id: productId,
                    field: "status",
                    stringValue: next,
                  })
                }
              />
              <RowAction
                id={productId}
                setIsEditDialogOpen={setIsEditDialogOpen}
                deleteMutation={deleteHelper}
                isDeletePending={isDeletePending}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Main Info */}
              <div className="border-2 border-border bg-card p-6 shadow-shadow">
                <h2 className="mb-6 flex items-center gap-2 font-heading text-xl">
                  <Package className="h-5 w-5" />
                  Үндсэн мэдээлэл
                </h2>

                <div className="space-y-6">
                  <EditableField
                    label="Нэр:"
                    value={product.name}
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "name",
                        stringValue: next,
                      })
                    }
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="font-medium text-sm">Ангилал:</p>
                      <p className="text-muted-foreground">
                        {product.category?.name || "Ангилал байхгүй"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium text-sm">Брэнд:</p>
                      <p className="text-muted-foreground">
                        {product.brand?.name || "Брэнд байхгүй"}
                      </p>
                    </div>
                  </div>

                  <EditableField
                    label="Тайлбар:"
                    type="textarea"
                    value={product.description}
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "description",
                        stringValue: next,
                      })
                    }
                  />

                  <EditableField
                    label="Үнэ:"
                    type="number"
                    value={product.price}
                    format={(cents) => formatCurrency(Number(cents))}
                    parse={(raw) =>
                      Math.round(
                        Number.parseFloat(raw || "0") * 100,
                      ) as unknown as string as never
                    }
                    isLoading={isUpdateProductFieldPending}
                    onSave={(nextCents) =>
                      updateProductField({
                        id: productId,
                        field: "price",
                        numberValue: nextCents,
                      })
                    }
                  />

                  <EditableField
                    label="Нөөц:"
                    type="number"
                    value={product.stock}
                    parse={(raw) =>
                      Number.parseInt(
                        raw || "0",
                        10,
                      ) as unknown as string as never
                    }
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "stock",
                        numberValue: next,
                      })
                    }
                  />
                </div>
              </div>

              {/* Additional Info */}
              <div className="border-2 border-border bg-card p-6 shadow-shadow">
                <h2 className="mb-4 font-heading text-xl">Нэмэлт мэдээлэл</h2>

                <div className="space-y-6">
                  <EditableField
                    label="Хэмжээ:"
                    value={product.amount}
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "amount",
                        stringValue: next,
                      })
                    }
                  />

                  <EditableField
                    label="Идэмхий чанар:"
                    value={product.potency}
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "potency",
                        stringValue: next,
                      })
                    }
                  />

                  <EditableField
                    label="Өдрийн хэрэглээ:"
                    type="number"
                    value={product.dailyIntake}
                    parse={(raw) =>
                      Number.parseFloat(
                        raw || "0",
                      ) as unknown as string as never
                    }
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "dailyIntake",
                        numberValue: next,
                      })
                    }
                  />

                  <EditableField
                    label="Хөнгөлөлт:"
                    type="number"
                    value={product.discount}
                    format={(value) => `${value}%`}
                    parse={(raw) =>
                      Number.parseInt(
                        raw || "0",
                        10,
                      ) as unknown as string as never
                    }
                    isLoading={isUpdateProductFieldPending}
                    onSave={(next) =>
                      updateProductField({
                        id: productId,
                        field: "discount",
                        numberValue: next,
                      })
                    }
                  />
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Images */}
              <div className="border-2 border-border bg-card p-6 shadow-shadow">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 font-heading text-xl">
                    <ImageIcon className="h-5 w-5" />
                    Зурагнууд
                  </h2>
                  <UploadButton
                    category="product"
                    onSuccess={(url) => {
                      addImage({
                        productId: productId,
                        url: url,
                      });
                    }}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                  {product.images?.map((image) => (
                    <div key={image.id} className="group relative">
                      <div className="aspect-square overflow-hidden rounded-lg border-2 border-border">
                        <img
                          src={image.url}
                          alt={`Product ${image.id}`}
                          className="h-full w-full object-cover"
                        />
                      </div>
                      {image.isPrimary && (
                        <div className="absolute top-1 right-1 rounded bg-primary px-1.5 py-0.5 text-primary-foreground text-xs">
                          Үндсэн
                        </div>
                      )}
                      <div className="absolute inset-0 flex items-center justify-center gap-1 rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                        {!image.isPrimary && (
                          <Button
                            onClick={() =>
                              setPrimaryImage({
                                productId: productId,
                                imageId: image.id,
                              })
                            }
                            size="icon"
                            variant="secondary"
                            className="h-6 w-6 bg-white/90 hover:bg-white"
                            disabled={isSetPrimaryImagePending}
                          >
                            {isSetPrimaryImagePending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        <Button
                          onClick={() =>
                            deleteImage({
                              id: image.id,
                            })
                          }
                          size="icon"
                          variant="destructive"
                          className="h-6 w-6 bg-red-500/90 hover:bg-red-500"
                          disabled={isDeleteImagePending}
                        >
                          {isDeleteImagePending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {(!product.images || product.images.length === 0) && (
                    <div className="col-span-full py-8 text-center text-muted-foreground">
                      <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      <p className="text-sm">Зураг байршуулаагүй байна</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-2 border-border bg-card p-4 shadow-shadow sm:p-6 lg:p-8">
                <h2 className="mb-4 flex items-center gap-2 font-heading text-lg sm:text-xl">
                  <BarChart3 className="h-5 w-5" />
                  Аналитик
                </h2>

                <div className="space-y-3 sm:space-y-4 lg:space-y-6">
                  <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4 xl:grid-cols-2">
                    <div className="rounded-lg border bg-muted/20 p-2">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 text-green-600" />
                        <span className="text-muted-foreground text-xs">
                          Борлуулалт
                        </span>
                      </div>
                      <p className="font-semibold text-sm">120</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-2">
                      <div className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-blue-600" />
                        <span className="text-muted-foreground text-xs">
                          Орлого
                        </span>
                      </div>
                      <p className="font-semibold text-sm">₮24K</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-2">
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3 text-purple-600" />
                        <span className="text-muted-foreground text-xs">
                          Үзэлт
                        </span>
                      </div>
                      <p className="font-semibold text-sm">1.25K</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-2">
                      <div className="flex items-center gap-1">
                        <Package className="h-3 w-3 text-orange-600" />
                        <span className="text-muted-foreground text-xs">
                          Хувь
                        </span>
                      </div>
                      <p className="font-semibold text-sm">9.6%</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 font-medium text-muted-foreground text-xs">
                      7 хоногийн борлуулалтын чиг хандлага
                    </h3>
                    <LineChart
                      data={[
                        { day: "Mon", sales: 12, revenue: 2400 },
                        { day: "Tue", sales: 8, revenue: 1600 },
                        { day: "Wed", sales: 15, revenue: 3000 },
                        { day: "Thu", sales: 22, revenue: 4400 },
                        { day: "Fri", sales: 18, revenue: 3600 },
                        { day: "Sat", sales: 25, revenue: 5000 },
                        { day: "Sun", sales: 20, revenue: 4000 },
                      ]}
                      index="day"
                      categories={["sales"]}
                      strokeColors={["hsl(var(--primary))"]}
                      className="h-20 sm:h-24"
                    />
                  </div>
                </div>
              </div>

              {/* Recent Orders */}
              <div className="border-2 border-border bg-card p-4 shadow-shadow sm:p-6 lg:p-8">
                <h2 className="mb-3 flex items-center gap-2 font-heading text-lg">
                  <Calendar className="h-4 w-4" />
                  Сүүлийн захиалгууд
                </h2>
                

                <div className="space-y-2 sm:space-y-3">
                  {orders.map((order)=>{
                    return(
                      <div  key={order.orderNumber} className="rounded-lg border-l-4 border-l-green-500 bg-muted/10 p-2 sm:p-3">
                        <div className="mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-primary" />
                            <span className="font-medium text-xs sm:text-sm">
                              {order.customerPhone}
                            </span>
                          </div>
                          <Badge className="bg-green-100 text-green-800 text-xs">
                            {order.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-muted-foreground text-xs">
                          <Calendar className="h-3 w-3" />
                          <span>{formatDateToText(order.createdAt)}</span>
                          <span>•</span>
                          <span>{order.orderNumber}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-xs">Тоо: 1</span>
                          <span className="font-semibold text-primary text-xs sm:text-sm">
                            {formatCurrency(order.total)}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                  {/* Mock Order 1 */}
                  <div className="rounded-lg border-l-4 border-l-green-500 bg-muted/10 p-2 sm:p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-primary" />
                        <span className="font-medium text-xs sm:text-sm">
                          +976 99123456
                        </span>
                      </div>
                      <Badge className="bg-green-100 text-green-800 text-xs">
                        Хүргэгдсэн
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="h-3 w-3" />
                      <span>Өнөөдөр, 14:30</span>
                      <span>•</span>
                      <span>#ORD-001</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs">Тоо: 2</span>
                      <span className="font-semibold text-primary text-xs sm:text-sm">
                        ₮480
                      </span>
                    </div>
                  </div>

                  {/* Mock Order 2 */}
                  <div className="rounded-lg border-l-4 border-l-blue-500 bg-muted/10 p-2 sm:p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-primary" />
                        <span className="font-medium text-xs sm:text-sm">
                          +976 88776655
                        </span>
                      </div>
                      <Badge className="bg-blue-100 text-blue-800 text-xs">
                        Илгээсэн
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="h-3 w-3" />
                      <span>Өчигдөр, 16:15</span>
                      <span>•</span>
                      <span>#ORD-002</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs">Тоо: 1</span>
                      <span className="font-semibold text-primary text-xs sm:text-sm">
                        ₮240
                      </span>
                    </div>
                  </div>

                  {/* Mock Order 3 */}
                  <div className="rounded-lg border-l-4 border-l-yellow-500 bg-muted/10 p-2 sm:p-3">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-primary" />
                        <span className="font-medium text-xs sm:text-sm">
                          +976 99887766
                        </span>
                      </div>
                      <Badge className="bg-yellow-100 text-xs text-yellow-800">
                        Хүлээгдэж буй
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground text-xs">
                      <Calendar className="h-3 w-3" />
                      <span>2 хоногийн өмнө, 10:20</span>
                      <span>•</span>
                      <span>#ORD-003</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs">Тоо: 3</span>
                      <span className="font-semibold text-primary text-xs sm:text-sm">
                        ₮720
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 border-t pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs sm:text-sm"
                  >
                    Бүх захиалгыг харах
                  </Button>
                </div>
              </div>

              {product.stock < 10 && (
                <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 sm:p-4">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                    <span className="font-medium text-sm sm:text-base">
                      Нөөц дуусч байна
                    </span>
                  </div>
                  <p className="mt-1 text-destructive text-xs sm:text-sm">
                    Зөвхөн {product.stock} ширхэг үлдсэн. Удахгүй нөөц нэмэх
                    хэрэгтэй.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

import {
    Package,
    Phone,
    Calendar,
    DollarSign,
    MapPin,
    CheckCircle,
    Copy,
  } from "lucide-react";
  import { Badge } from "@/components/ui/badge";
  import { Card, CardContent } from "@/components/ui/card";
  import type { OrderType } from "@/lib/types";
  import RowActions from "@/components/row-actions";
  import { useState } from "react";
  import { Button } from "@/components/ui/button";
  import { toast } from "sonner";
  import {
    getPaymentProviderIcon,
    getPaymentStatusColor,
    getOrderStatusStyles,
  } from "@/lib/utils";
  
  const OrderCard = ({ order }: { order: OrderType }) => {
    const statusStyles = getOrderStatusStyles(order.status);
    const [_isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    return (
      <Card
        className={`border-l-4 transition-shadow duration-200 hover:shadow-md ${statusStyles.border} h-64 sm:h-72 md:h-80`}
      >
        <CardContent className="p-0 h-full flex flex-col">
          {/* Header section */}
          <div className="flex items-center justify-between gap-2 border-b bg-muted/5 p-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" />
                <h3 className="text-base font-semibold">{order.customerPhone}</h3>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  <span className="font-medium">#{order.orderNumber}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
  
            <div className="flex flex-col items-end gap-1">
              <Badge
                className={`${statusStyles.badge} px-2 py-0.5 text-xs shadow-sm`}
              >
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </Badge>
  
              {order.payments.length > 0 &&
                order.payments[0].status &&
                order.payments[0].provider && (
                  <Badge
                    className={`flex h-5 items-center gap-1.5 rounded-md px-2 text-[10px] shadow-sm ${getPaymentStatusColor(
                      order.payments[0].status,
                    )}`}
                  >
                    <span>
                      {getPaymentProviderIcon(order.payments[0].provider)}
                    </span>
                    <span>
                      {order.payments[0].status === "success"
                        ? "Paid"
                        : order.payments[0].status === "failed"
                          ? "Failed"
                          : "Pending"}
                    </span>
                  </Badge>
                )}
            </div>
          </div>
  
          <div className="border-b bg-muted/5 px-3 py-2">
            <div className="flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="text-sm font-semibold">
                {order.address || "No address provided"}
              </span>
              <Button
                size={"icon"}
                className="h-7 w-7"
                variant={"default"}
              onClick={async () => {
                await navigator.clipboard.writeText(order.address);
                toast("Хаяг хуулагдлаа");
              }}
              >
                {" "}
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
  
          {/* Main content */}
          <div className="p-3 flex-1 overflow-y-auto">
            <div className="flex h-full flex-col sm:gap-4">
              <div className="w-full flex-1 flex flex-col overflow-hidden">
                <div className="mb-2 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-medium text-muted-foreground">
                      Бүтээгдэхүүн
                    </h4>
                    <span className="rounded-full bg-muted/20 px-1.5 py-0.5 text-xs">
                      {order.orderDetails.length}
                    </span>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-bold text-primary">
                    <DollarSign className="h-3.5 w-3.5" />₮
                    {order.total.toFixed(2)}
                  </span>
                </div>
  
                <div className="grid flex-1 grid-cols-2 gap-1.5 overflow-auto pr-1">
                  {order.orderDetails.map((detail, index) => (
                    <div
                      key={order.orderNumber + detail.product.id + index}
                      className="flex items-center gap-1.5 rounded border bg-card p-1.5 text-xs"
                    >
                      <div className="h-10 w-10 sm:h-12 sm:w-12 shrink-0 overflow-hidden rounded bg-muted/10">
                        <img
                          src={detail.product.images[0].url || "/placeholder.jpg"}
                          alt={detail.product.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">
                          {detail.product.name}
                        </p>
                        <span className="text-xs text-muted-foreground">
                          x{detail.quantity}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
  
                <div className="flex items-center gap-2 border-t pt-1 shrink-0">
                  {/* Action buttons */}
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={order.status === "delivered"}
                    onClick={() => {console.log("shipped")}}
                  >
                    <CheckCircle className="h-3 w-3" />
                    <span>Илгээсэн</span>
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={order.status === "delivered"}
                    onClick={() => {console.log("delivered")}}
                  >
                    <CheckCircle className="h-3 w-3" />
                    <span>Хүргэсэн</span>
                  </Button>
  
                  <RowActions
                    id={order.id}
                    setIsEditDialogOpen={setIsEditDialogOpen}
                    deleteMutation={() => {console.log("delete")}}
                    isDeletePending={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };
  
  export default OrderCard;
  
  
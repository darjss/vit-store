import { router, publicProcedure } from "@/lib/trpc";
import { OrdersTable, CustomersTable, PaymentsTable,OrderDetailsTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { orderSchema } from "@/lib/schema";
import { generateOrderNumber } from "@/lib/utils";

export const order = router({
  createOrder: publicProcedure
    .input(
      orderSchema
    )
    .mutation(async ({ input, ctx }) => {
      const { phone, address, total, notes, items } = input;
      console.log(input)
      await ctx.db.transaction(async (tx) => {
        const customer = await tx.query.CustomersTable.findFirst({
          where: eq(CustomersTable.phone, phone),
        });

        if (!customer) {
          await tx.insert(CustomersTable).values({
            phone: phone,
            address: address,
          });
        }

        const [order] = await tx
          .insert(OrdersTable)
          .values({
            orderNumber: generateOrderNumber(),
            customerPhone: phone,
            status: "pending",
            notes: notes,
            total: total,
            address: address,
            deliveryProvider: "tu-delivery",
            createdAt: new Date(),
          })
          .returning({ orderId: OrdersTable.id });
        if (order?.orderId === undefined) {
          return;
        }
        const orderId = order?.orderId;

        for (const product of items) {
          await tx.insert(OrderDetailsTable).values({
            orderId: orderId,
            productId: product.productId || 0,
            quantity: product.quantity,
          });
        }
        const paymentResult = await tx
          .insert(PaymentsTable)
          .values({
            orderId: orderId,
            provider: "transfer",
            status: "pending",
          })
          .returning({ id: PaymentsTable.id });
        return {
          orderId: orderId,
          paymentId: paymentResult[0]?.id,
          message: "Order created successfully",
        };
      });
    }),
});

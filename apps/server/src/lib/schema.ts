import { z } from "zod";
export const orderSchema = z.object({
  phone: z.coerce
    .number()
    .int()
    .min(60000000, { message: "Number must be at least 60000000" })
    .max(99999999, { message: "Number must be at most 99999999" }),
  address: z.string().min(10, {
    message: "Address is too short",
  }),
  total: z.number(),
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive().finite(),
        quantity: z.number().min(1, {
          message: "At least one product must be selected",
        }),
      })
    )

});
export type orderType = z.infer<typeof orderSchema>;

import { redeemPayLink } from "@vit/api/lib/payments/pay-link";
import { Hono } from "hono";
import type { ServerHonoEnv } from "../lib/logging";

const app = new Hono<ServerHonoEnv>();

// The storefront forwards amerikvitamin.mn/pay/<code> here, so the session
// cookie and the relative redirect both land on the storefront origin.
app.get("/:code", async (c) => {
	const target = await redeemPayLink(c, c.req.param("code"));
	c.header("cache-control", "no-store");
	c.get("log").info(target ? "pay_link.redeemed" : "pay_link.rejected", {
		paymentNumber: target?.paymentNumber,
		redirect: target?.path.split("?")[0],
	});
	return c.redirect(target?.path ?? "/order-tracking", 302);
});

export default app;

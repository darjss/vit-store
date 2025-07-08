import { env } from "cloudflare:workers";
import { Google } from "arctic";

export const google=new Google(
	env.GOOGLE_CLIENT_ID || "",
	env.GOOGLE_CLIENT_SECRET || "",
	env.GOOGLE_CALLBACK_URL || ""

);


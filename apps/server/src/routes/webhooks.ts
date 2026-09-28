import type { MessengerWebhookPayload } from "@flue/messenger";
import type { GenericWebhookPayload } from "@vit/api/integrations";
import { messengerWebhookHandler } from "@vit/api/integrations";
import { createMessengerWebhookRoutes } from "./messenger-webhook-routes";

export { createMessengerWebhookRoutes } from "./messenger-webhook-routes";

export default createMessengerWebhookRoutes((payload: MessengerWebhookPayload) =>
	messengerWebhookHandler(payload as unknown as GenericWebhookPayload),
);

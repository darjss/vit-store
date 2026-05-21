export type { PostHogConfig } from "~/lib/integrations/posthog/client";
export { createPostHogClient, PostHogClient } from "~/lib/integrations/posthog/client";
export {
	identifyUserServerSide,
	trackOrderPlacedServerSide,
	trackPaymentConfirmedServerSide,
	trackQpayInvoiceFailedServerSide,
} from "~/lib/integrations/posthog/capture";

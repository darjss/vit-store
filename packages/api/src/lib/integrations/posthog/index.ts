export type { PostHogConfig } from "~/lib/integrations/posthog/client";
export { createPostHogClient, PostHogClient } from "~/lib/integrations/posthog/client";
export {
	identifyUserServerSide,
	trackOrderCreatedServerSide,
	trackOrderPlacedServerSide,
	trackPaymentConfirmedServerSide,
	trackQpayInvoiceCreatedServerSide,
	trackQpayInvoiceFailedServerSide,
} from "~/lib/integrations/posthog/capture";

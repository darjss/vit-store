export {
	identifyUserServerSide,
	trackOrderCreatedServerSide,
	trackOrderPlacedServerSide,
	trackPaymentConfirmedServerSide,
	trackQpayInvoiceCreatedServerSide,
	trackQpayInvoiceFailedServerSide,
} from "~/lib/integrations/posthog/capture";
export type { PostHogConfig, ProductSearchRankingSignal } from "~/lib/integrations/posthog/client";
export { createPostHogClient, PostHogClient } from "~/lib/integrations/posthog/client";

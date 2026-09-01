/** Result shape shared by Messenger/Telegram outbound send helpers. */
export type ChannelSendResult = { messageId: string | null; ok: true };

export type ChannelTextSend = (text: string) => Promise<ChannelSendResult>;

export type ChannelBankDetailsSend = (
	text: string,
	ref: { checkoutToken: string | null; paymentNumber: string },
) => Promise<ChannelSendResult | undefined>;

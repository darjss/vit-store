import Client, {
	type Device,
	type DeviceSettings,
	type HealthResponse,
	type LogEntry,
	type Message,
	type MessageState,
	type MessagesExportRequest,
	type RegisterWebHookRequest,
	type WebHook,
	WebHookEventType,
} from "android-sms-gateway";

// Re-export types from android-sms-gateway
export type {
	Device,
	DeviceSettings,
	HealthResponse,
	LogEntry,
	Message,
	MessageState,
	MessagesExportRequest,
	RegisterWebHookRequest,
	WebHook,
};

export { WebHookEventType };

// Define JWT types locally (matching android-sms-gateway v3.0 API)
export interface TokenRequest {
	/** The scopes to include in the token */
	scopes: string[];
	/** The time-to-live (TTL) of the token in seconds */
	ttl?: number;
}

export interface TokenResponse {
	/** The JWT access token */
	access_token: string;
	/** The type of the token */
	token_type: string;
	/** The unique identifier of the token */
	id: string;
	/** The expiration time of the token */
	expires_at: string;
}

/**
 * HTTP client interface for making requests
 */
interface HttpClient {
	get<T>(url: string, headers?: Record<string, string>): Promise<T>;
	post<T>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T>;
	put<T>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T>;
	patch<T>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<T>;
	delete<T>(url: string, headers?: Record<string, string>): Promise<T>;
}

/**
 * Create a fetch-based HTTP client
 */
function createHttpClient(): HttpClient {
	const handleResponse = async <T>(response: Response): Promise<T> => {
		if (response.status === 204) {
			return null as T;
		}

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP error ${response.status}: ${text}`);
		}

		const contentType = response.headers.get("Content-Type");
		if (contentType?.includes("application/json")) {
			return (await response.json()) as T;
		}
		return (await response.text()) as T;
	};

	return {
		async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
			const response = await fetch(url, { method: "GET", headers });
			return handleResponse<T>(response);
		},
		async post<T>(
			url: string,
			body: unknown,
			headers?: Record<string, string>,
		): Promise<T> {
			const response = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
			return handleResponse<T>(response);
		},
		async put<T>(
			url: string,
			body: unknown,
			headers?: Record<string, string>,
		): Promise<T> {
			const response = await fetch(url, {
				method: "PUT",
				headers,
				body: JSON.stringify(body),
			});
			return handleResponse<T>(response);
		},
		async patch<T>(
			url: string,
			body: unknown,
			headers?: Record<string, string>,
		): Promise<T> {
			const response = await fetch(url, {
				method: "PATCH",
				headers,
				body: JSON.stringify(body),
			});
			return handleResponse<T>(response);
		},
		async delete<T>(url: string, headers?: Record<string, string>): Promise<T> {
			const response = await fetch(url, { method: "DELETE", headers });
			return handleResponse<T>(response);
		},
	};
}

/**
 * SMS Gateway client configuration options
 */
export interface SmsGatewayConfig {
	/** Username for Basic Auth (empty string for JWT auth) */
	login: string;
	/** Password for Basic Auth or JWT token */
	password: string;
	/** Optional custom base URL */
	baseUrl?: string;
}

/**
 * Create an SMS Gateway client instance
 *
 * @example Basic Auth
 * ```ts
 * const client = createSmsClient({
 *   login: process.env.SMS_GATEWAY_LOGIN!,
 *   password: process.env.SMS_GATEWAY_PASSWORD!,
 * });
 * ```
 *
 * @example JWT Auth
 * ```ts
 * const client = createSmsClient({
 *   login: "", // Empty string for JWT
 *   password: jwtToken,
 * });
 * ```
 */
export function createSmsClient(config: SmsGatewayConfig): Client {
	const { login, password, baseUrl } = config;
	const httpClient = createHttpClient();
	return new Client(login, password, httpClient, baseUrl);
}

/**
 * Default SMS Gateway client using environment variables
 *
 * Requires the following environment variables:
 * - SMS_GATEWAY_LOGIN: Username for Basic Auth
 * - SMS_GATEWAY_PASSWORD: Password for Basic Auth
 *
 * Optional:
 * - SMS_GATEWAY_BASE_URL: Custom API base URL
 */
export const smsClient = createSmsClient({
	login: process.env.SMS_GATEWAY_LOGIN ?? "",
	password: process.env.SMS_GATEWAY_PASSWORD ?? "",
	baseUrl: process.env.SMS_GATEWAY_BASE_URL,
});

// Extended client type to include JWT methods
type ExtendedClient = Client & {
	generateToken(request: TokenRequest): Promise<TokenResponse>;
	revokeToken(jti: string): Promise<void>;
};

/**
 * Helper functions for common SMS operations
 */
export const smsGateway = {
	/**
	 * Send an SMS message
	 *
	 * @example
	 * ```ts
	 * const result = await smsGateway.sendSms({
	 *   phoneNumbers: ["+1234567890"],
	 *   message: "Hello from Vit Store!",
	 * });
	 * ```
	 */
	async sendSms(
		message: Message,
		options?: { skipPhoneValidation?: boolean },
	): Promise<MessageState> {
		return smsClient.send(message, options);
	},

	/**
	 * Send an SMS and wait until it's actually sent (not just queued)
	 * Polls the message state until it changes from "Pending"
	 *
	 * @param message - The SMS message to send
	 * @param options - Send options
	 * @param options.skipPhoneValidation - Skip phone number validation
	 * @param options.maxAttempts - Maximum polling attempts (default 10)
	 * @param options.intervalMs - Polling interval in ms (default 1000)
	 * @returns The final message state after sending
	 * @throws Error if message fails to send
	 *
	 * @example
	 * ```ts
	 * const result = await smsGateway.sendSmsAndWait({
	 *   phoneNumbers: ["+1234567890"],
	 *   message: "Your OTP is 1234",
	 * });
	 * console.log(result.state); // "Sent" or "Delivered"
	 * ```
	 */
	async sendSmsAndWait(
		message: Message,
		options?: {
			skipPhoneValidation?: boolean;
			maxAttempts?: number;
			intervalMs?: number;
		},
	): Promise<MessageState> {
		const {
			skipPhoneValidation,
			maxAttempts = 10,
			intervalMs = 1000,
		} = options ?? {};

		const result = await smsClient.send(message, { skipPhoneValidation });

		// Poll until status changes from Pending
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			const state = await smsClient.getState(result.id);

			if (state.state !== "Pending") {
				return state;
			}

			await new Promise((resolve) => setTimeout(resolve, intervalMs));
		}

		// Return final state after max attempts
		return smsClient.getState(result.id);
	},

	/**
	 * Get the state of a sent message
	 */
	async getMessageState(messageId: string): Promise<MessageState> {
		return smsClient.getState(messageId);
	},

	/**
	 * List all registered devices
	 */
	async getDevices(): Promise<Device[]> {
		return smsClient.getDevices();
	},

	/**
	 * Remove a device
	 */
	async deleteDevice(deviceId: string): Promise<void> {
		return smsClient.deleteDevice(deviceId);
	},

	/**
	 * List all registered webhooks
	 */
	async getWebhooks(): Promise<WebHook[]> {
		return smsClient.getWebhooks();
	},

	/**
	 * Register a new webhook
	 *
	 * @example
	 * ```ts
	 * await smsGateway.registerWebhook({
	 *   url: "https://your-api.com/sms-callback",
	 *   event: WebHookEventType.SmsReceived,
	 * });
	 * ```
	 */
	async registerWebhook(request: RegisterWebHookRequest): Promise<WebHook> {
		return smsClient.registerWebhook(request);
	},

	/**
	 * Delete a webhook
	 */
	async deleteWebhook(webhookId: string): Promise<void> {
		return smsClient.deleteWebhook(webhookId);
	},

	/**
	 * Check system health
	 */
	async getHealth(): Promise<HealthResponse> {
		return smsClient.getHealth();
	},

	/**
	 * Export inbox messages
	 */
	async exportInbox(request: MessagesExportRequest): Promise<void> {
		return smsClient.exportInbox(request);
	},

	/**
	 * Get logs within a time range
	 */
	async getLogs(from?: Date, to?: Date): Promise<LogEntry[]> {
		return smsClient.getLogs(from, to);
	},

	/**
	 * Get current settings
	 */
	async getSettings(): Promise<DeviceSettings> {
		return smsClient.getSettings();
	},

	/**
	 * Update settings (full replacement)
	 */
	async updateSettings(settings: DeviceSettings): Promise<void> {
		return smsClient.updateSettings(settings);
	},

	/**
	 * Partially update settings
	 */
	async patchSettings(settings: Partial<DeviceSettings>): Promise<void> {
		return smsClient.patchSettings(settings);
	},

	/**
	 * Generate a JWT token (requires Basic Auth client)
	 *
	 * @example
	 * ```ts
	 * const token = await smsGateway.generateToken({
	 *   scopes: ["messages:send", "messages:read"],
	 *   ttl: 3600, // 1 hour
	 * });
	 * ```
	 */
	async generateToken(request: TokenRequest): Promise<TokenResponse> {
		return (smsClient as ExtendedClient).generateToken(request);
	},

	/**
	 * Revoke a JWT token by its ID (jti)
	 */
	async revokeToken(jti: string): Promise<void> {
		return (smsClient as ExtendedClient).revokeToken(jti);
	},
};

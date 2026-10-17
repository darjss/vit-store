import { AgentWorkflow, type AgentWorkflowEvent, type AgentWorkflowStep } from "agents/workflows";
import type { Conversation, PaymentTickResult } from "./conversation";

type PaymentWatchParams = { paymentNumber: string };

// One instance per payment (id `pay_<paymentNumber>`): each tick is a retried
// step and each gap a durable sleep, so the watch survives worker restarts
// and Conversation DO evictions without the old re-arm scheduler.
export class PaymentWatch extends AgentWorkflow<Conversation, PaymentWatchParams> {
	async run(event: AgentWorkflowEvent<PaymentWatchParams>, step: AgentWorkflowStep) {
		const { paymentNumber } = event.payload;
		for (let i = 0; ; i++) {
			const tick = await step.do(
				`check ${i}`,
				{ retries: { backoff: "exponential", delay: "10 seconds", limit: 5 } },
				async (): Promise<PaymentTickResult> => {
					// The RPC return carries a Disposable stub marker that is not
					// serializable; a fresh object is what the step stores.
					const r = await this.agent.paymentTick(paymentNumber);
					return r.done
						? { action: r.action, done: true }
						: { action: r.action, done: false, nextInSeconds: r.nextInSeconds };
				},
			);
			if (tick.done) {
				return tick;
			}
			await step.sleep(`wait ${i}`, tick.nextInSeconds * 1000);
		}
	}
}

type Waiter<T> = {
	target: number;
	resolve: (value: T) => void;
	reject: (error: unknown) => void;
};

/**
 * Coalesces rebuild requests without dropping invalidations that arrive while
 * an earlier rebuild is reading its source data. Each requester resolves only
 * after a rebuild at or beyond its own generation completes.
 */
export class LosslessRebuildQueue<T, Reason> {
	private requestedGeneration = 0;
	private completedGeneration = 0;
	private pendingReason: Reason | undefined;
	private runPromise: Promise<void> | null = null;
	private waiters: Waiter<T>[] = [];

	constructor(private readonly run: (reason: Reason) => Promise<T>) {}

	request(reason: Reason): Promise<T> {
		const target = ++this.requestedGeneration;
		this.pendingReason = reason;
		const result = new Promise<T>((resolve, reject) => {
			this.waiters.push({ target, resolve, reject });
		});
		this.ensureRunning();
		return result;
	}

	async whenIdle(): Promise<void> {
		while (this.runPromise) await this.runPromise;
	}

	private ensureRunning(): void {
		if (this.runPromise) return;
		this.runPromise = this.drain().finally(() => {
			this.runPromise = null;
			if (this.completedGeneration < this.requestedGeneration) {
				this.ensureRunning();
			}
		});
	}

	private async drain(): Promise<void> {
		while (this.completedGeneration < this.requestedGeneration) {
			const target = this.requestedGeneration;
			const reason = this.pendingReason;
			if (reason === undefined) {
				throw new Error("Rebuild generation has no reason");
			}

			try {
				const result = await this.run(reason);
				this.completedGeneration = target;
				this.settleThrough(target, (waiter) => waiter.resolve(result));
			} catch (error) {
				this.completedGeneration = target;
				this.settleThrough(target, (waiter) => waiter.reject(error));
			}
		}
	}

	private settleThrough(
		target: number,
		settle: (waiter: Waiter<T>) => void,
	): void {
		const pending: Waiter<T>[] = [];
		for (const waiter of this.waiters) {
			if (waiter.target <= target) settle(waiter);
			else pending.push(waiter);
		}
		this.waiters = pending;
	}
}

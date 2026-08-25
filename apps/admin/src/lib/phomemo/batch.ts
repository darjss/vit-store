import { DELAY_BETWEEN_JOBS_MS } from "./constants";
import type { M110Printer } from "./printer";
import { renderPhoneRaster } from "./raster";

export type PrintOrder = {
	id: number;
	orderNumber: string;
	customerPhone: string;
};

export type JobStatus =
	| "pending"
	| "printing"
	| "printed"
	| "failed"
	| "cancelled";

export type JobState = {
	order: PrintOrder;
	status: JobStatus;
	error?: string;
};

export type BatchProgress = {
	current: number;
	total: number;
	jobs: JobState[];
};

function sleep(ms: number) {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function printPhones(
	printer: M110Printer,
	orders: PrintOrder[],
	opts: {
		signal: AbortSignal;
		onProgress: (progress: BatchProgress) => void;
	},
) {
	const jobs: JobState[] = orders.map((order) => ({
		order,
		status: "pending" as const,
	}));

	const emit = (current: number) => {
		opts.onProgress({
			current,
			total: jobs.length,
			jobs: jobs.map((j) => ({ ...j })),
		});
	};

	emit(0);

	for (let i = 0; i < jobs.length; i++) {
		if (opts.signal.aborted) {
			for (let j = i; j < jobs.length; j++) {
				jobs[j]!.status = "cancelled";
			}
			emit(i);
			return jobs;
		}

		const job = jobs[i]!;
		job.status = "printing";
		emit(i + 1);

		try {
			const raster = renderPhoneRaster(job.order.customerPhone);
			await printer.print(raster);
			job.status = "printed";
		} catch (error) {
			job.status = "failed";
			job.error =
				error instanceof Error ? error.message : "Хэвлэхэд алдаа гарлаа";
			emit(i + 1);
			return jobs;
		}

		emit(i + 1);
		if (i < jobs.length - 1) {
			await sleep(DELAY_BETWEEN_JOBS_MS);
		}
	}

	return jobs;
}

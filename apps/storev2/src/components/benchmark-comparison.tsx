import { createMemo, createResource, Show } from "solid-js";
import IconCheck from "~icons/ri/check-line";
import IconComputer from "~icons/ri/computer-line";
import { api } from "../lib/trpc";

interface BenchmarkComparisonProps {
	serverFetchTime: number;
	serverDbTime: number;
	productCount: number;
	kvWriteTime?: number;
	kvReadTime?: number;
	redisWriteTime?: number;
	redisReadTime?: number;
}

interface BenchmarkResult {
	dbElapsed: number;
	productCount: number;
	fetchTime: number;
	kvWriteElapsed?: number;
	kvReadElapsed?: number;
	redisWriteElapsed?: number;
	redisReadElapsed?: number;
}

export default function BenchmarkComparison(props: BenchmarkComparisonProps) {
	const fetchClientData = async (): Promise<BenchmarkResult> => {
		const startTime = performance.now();
		const result = await api.product.getProductBenchmark.query();
		const fetchTime = performance.now() - startTime;

		return {
			dbElapsed: result.dbElapsed,
			productCount: result.product.length,
			fetchTime,
			kvWriteElapsed: result.kvWriteElapsed,
			kvReadElapsed: result.kvReadElapsed,
			redisWriteElapsed: result.redisWriteElapsed,
			redisReadElapsed: result.redisReadElapsed,
		};
	};

	const [data, { refetch }] = createResource(fetchClientData, {
		initialValue: undefined,
	});

	const formatTime = (ms: number) => {
		return `${ms.toFixed(2)}ms`;
	};

	const difference = createMemo(() => {
		const result = data();
		if (!result) return null;

		const diff = result.fetchTime - props.serverFetchTime;
		const percentage = ((diff / props.serverFetchTime) * 100).toFixed(1);

		return {
			value: diff,
			percentage,
			isFaster: diff < 0,
		};
	});

	return (
		<>
			{/* Control Panel */}
			<div class="bg-background p-6 rounded-lg shadow-soft">
				<button
					type="button"
					onClick={refetch}
					disabled={data.loading}
					class="w-full bg-foreground px-6 py-3 font-semibold text-white transition-colors hover:bg-foreground/80 disabled:bg-muted-foreground"
				>
					{data.loading ? "Fetching..." : "Run Client-Side Benchmark"}
				</button>

				<Show when={data.error}>
					<div class="mt-4 border border-border bg-error/10 p-4 text-destructive">
						Error:{" "}
						{data.error instanceof Error
							? data.error.message
							: "Failed to fetch data"}
					</div>
				</Show>
			</div>

			{/* Client-Side Results */}
			<div class="rounded-lg border border-border bg-card p-6 shadow-soft">
				<div class="mb-4 flex items-center gap-2">
					<IconComputer class="h-6 w-6 text-primary" />
					<h2 class="font-bold text-2xl text-foreground">Client-Side (CSR)</h2>
				</div>

				<Show
					when={!data.loading && data()}
					fallback={
						<div class="flex h-64 items-center justify-center">
							<div class="text-center">
								<Show
									when={data.loading}
									fallback={
										<p class="text-muted-foreground">
											Click the button to run benchmark
										</p>
									}
								>
									<div class="mx-auto size-12 animate-spin border-[3px] border-border border-t-primary" />
									<p class="mt-4 text-primary">Fetching data...</p>
								</Show>
							</div>
						</div>
					}
				>
					<div class="space-y-3">
						<div class="bg-background p-4">
							<p class="mb-1 text-muted-foreground text-sm">Total Fetch Time</p>
							<p class="font-bold text-3xl text-foreground">
								{formatTime(data()?.fetchTime ?? 0)}
							</p>
						</div>

						<div class="bg-background p-4">
							<p class="mb-1 text-muted-foreground text-sm">Database Query Time</p>
							<p class="font-semibold text-2xl text-primary">
								{formatTime(data()?.dbElapsed ?? 0)}
							</p>
						</div>

						<div class="bg-background p-4">
							<p class="mb-1 text-muted-foreground text-sm">Products Fetched</p>
							<p class="font-semibold text-2xl text-primary">
								{data()?.productCount}
							</p>
						</div>

						<Show when={data()?.kvReadElapsed}>
							{(elapsed) => (
								<div class="bg-background p-4">
									<p class="mb-1 text-muted-foreground text-sm">
										KV Read Time (Client)
									</p>
									<p class="font-semibold text-2xl text-foreground">
										{formatTime(elapsed())}
									</p>
								</div>
							)}
						</Show>

						<Show when={data()?.redisReadElapsed}>
							{(elapsed) => (
								<div class="bg-background p-4">
									<p class="mb-1 text-muted-foreground text-sm">
										Redis Read Time (Client)
									</p>
									<p class="font-semibold text-2xl text-foreground">
										{formatTime(elapsed())}
									</p>
								</div>
							)}
						</Show>
					</div>

					<div class="mt-4 bg-primary/20 p-3">
						<p class="flex items-center gap-1 font-medium text-foreground text-sm">
							<IconCheck class="h-4 w-4" /> Rendered in browser
						</p>
						<p class="mt-1 text-foreground text-xs">
							Includes network latency + processing time
						</p>
					</div>
				</Show>
			</div>

			{/* Comparison Summary */}
			<Show when={data() && difference()}>
				{(diff) => (
					<div class="bg-background p-6 rounded-lg shadow-soft">
						<h3 class="mb-4 font-bold text-xl">Performance Analysis</h3>

						<div class="grid gap-4 md:grid-cols-3">
							<div class="bg-muted/30 p-4">
								<p class="mb-1 text-muted-foreground text-sm">Time Difference</p>
								<p
									class={`font-bold text-2xl ${
										diff().isFaster ? "text-foreground" : "text-destructive"
									}`}
								>
									{diff().isFaster ? "-" : "+"}
									{formatTime(Math.abs(diff().value))}
								</p>
							</div>

							<div class="bg-muted/30 p-4">
								<p class="mb-1 text-muted-foreground text-sm">Percentage Difference</p>
								<p
									class={`font-bold text-2xl ${
										diff().isFaster ? "text-foreground" : "text-destructive"
									}`}
								>
									{diff().percentage}% {diff().isFaster ? "faster" : "slower"}
								</p>
							</div>

							<div class="bg-muted/30 p-4">
								<p class="mb-1 text-muted-foreground text-sm">Network Overhead</p>
								<p class="font-bold text-2xl text-foreground">
									{formatTime(
										(data()?.fetchTime ?? 0) -
											(data()?.dbElapsed ?? 0) -
											props.serverDbTime,
									)}
								</p>
							</div>
						</div>

						<div class="mt-6 border border-border bg-primary/10 p-4">
							<h4 class="mb-2 font-semibold text-foreground">Key Insights:</h4>
							<ul class="space-y-2 text-sm text-foreground">
								<li>
									• Server-side rendering delivers content immediately with the
									initial HTML
								</li>
								<li>
									• Client-side fetching includes additional network round-trip
									time
								</li>
								<li>
									• Database query time is similar for both approaches (~
									{formatTime(props.serverDbTime)})
								</li>
								<li>
									• The main difference is network latency from browser to
									server
								</li>
								{data()?.kvReadElapsed !== undefined &&
									props.kvReadTime !== undefined && (
										<li>
											• KV read time: {formatTime(data()?.kvReadElapsed ?? 0)}{" "}
											(client) vs {formatTime(props.kvReadTime ?? 0)} (server) -
											typically very fast
										</li>
									)}
								{data()?.redisReadElapsed !== undefined &&
									props.redisReadTime !== undefined && (
										<li>
											• Redis read time:{" "}
											{formatTime(data()?.redisReadElapsed ?? 0)} (client) vs{" "}
											{formatTime(props.redisReadTime ?? 0)} (server) - often
											faster than KV for simple operations
										</li>
									)}
							</ul>
						</div>
					</div>
				)}
			</Show>
		</>
	);
}

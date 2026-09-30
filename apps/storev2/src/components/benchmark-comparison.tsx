import { createMemo, createResource, Show } from "solid-js";
import { MonitorIcon as IconComputer } from "@solar-icons/solid/linear";
import { CheckCircleIcon as IconCheck } from "@solar-icons/solid/bold";
import { isNativeError, thrownErrorWireSchema } from "@/lib/error-wire";
import { parse } from "valibot";
import { api } from "../lib/trpc";

interface BenchmarkComparisonProps {
	kvReadTime?: number;
	kvWriteTime?: number;
	productCount: number;
	redisReadTime?: number;
	redisWriteTime?: number;
	serverDbTime: number;
	serverFetchTime: number;
}

interface BenchmarkResult {
	dbElapsed: number;
	fetchTime: number;
	kvReadElapsed?: number;
	kvWriteElapsed?: number;
	productCount: number;
	redisReadElapsed?: number;
	redisWriteElapsed?: number;
}

const fetchClientData = async (): Promise<BenchmarkResult> => {
	const startTime = performance.now();
	const result = await api.product.getProductBenchmark.query();
	const fetchTime = performance.now() - startTime;

	return {
		dbElapsed: result.dbElapsed,
		fetchTime,
		kvReadElapsed: result.kvReadElapsed,
		kvWriteElapsed: result.kvWriteElapsed,
		productCount: result.product.length,
		redisReadElapsed: result.redisReadElapsed,
		redisWriteElapsed: result.redisWriteElapsed,
	};
};

const formatTime = (ms: number) => `${ms.toFixed(2)}ms`;

const benchmarkErrorMessage = (wire: import("@/lib/error-wire").ThrownErrorWire) =>
	isNativeError(wire) ? wire.message : "Failed to fetch data";

function BenchmarkPerformanceAnalysis(props: {
	data: BenchmarkResult;
	diff: { isFaster: boolean; percentage: string; value: number };
	kvReadTime?: number;
	redisReadTime?: number;
	serverDbTime: number;
}) {
	return (
		<div class="bg-background shadow-soft rounded-lg p-6">
			<h3 class="mb-4 text-xl font-bold">Performance Analysis</h3>

			<div class="grid gap-4 md:grid-cols-3">
				<div class="bg-muted/30 p-4">
					<p class="text-muted-foreground mb-1 text-sm">Time Difference</p>
					<p
						class={`text-2xl font-bold ${
							props.diff.isFaster ? "text-foreground" : "text-destructive"
						}`}
					>
						{props.diff.isFaster ? "-" : "+"}
						{formatTime(Math.abs(props.diff.value))}
					</p>
				</div>

				<div class="bg-muted/30 p-4">
					<p class="text-muted-foreground mb-1 text-sm">Percentage Difference</p>
					<p
						class={`text-2xl font-bold ${
							props.diff.isFaster ? "text-foreground" : "text-destructive"
						}`}
					>
						{props.diff.percentage}% {props.diff.isFaster ? "faster" : "slower"}
					</p>
				</div>

				<div class="bg-muted/30 p-4">
					<p class="text-muted-foreground mb-1 text-sm">Network Overhead</p>
					<p class="text-foreground text-2xl font-bold">
						{formatTime(props.data.fetchTime - props.data.dbElapsed - props.serverDbTime)}
					</p>
				</div>
			</div>

			<div class="border-border bg-primary/10 mt-6 border p-4">
				<h4 class="text-foreground mb-2 font-semibold">Key Insights:</h4>
				<ul class="text-foreground space-y-2 text-sm">
					<li>• Server-side rendering delivers content immediately with the initial HTML</li>
					<li>• Client-side fetching includes additional network round-trip time</li>
					<li>
						• Database query time is similar for both approaches (~
						{formatTime(props.serverDbTime)})
					</li>
					<li>• The main difference is network latency from browser to server</li>
					{props.data.kvReadElapsed !== undefined && props.kvReadTime !== undefined && (
						<li>
							• KV read time: {formatTime(props.data.kvReadElapsed)} (client) vs{" "}
							{formatTime(props.kvReadTime)} (server) - typically very fast
						</li>
					)}
					{props.data.redisReadElapsed !== undefined && props.redisReadTime !== undefined && (
						<li>
							• Redis read time: {formatTime(props.data.redisReadElapsed)} (client) vs{" "}
							{formatTime(props.redisReadTime)} (server) - often faster than KV for simple
							operations
						</li>
					)}
				</ul>
			</div>
		</div>
	);
}

export default function BenchmarkComparison(props: BenchmarkComparisonProps) {
	const [data, { refetch }] = createResource(fetchClientData, {
		initialValue: undefined,
	});

	const difference = createMemo(() => {
		const result = data();
		if (!result) {
			return null;
		}

		const diff = result.fetchTime - props.serverFetchTime;
		const percentage = ((diff / props.serverFetchTime) * 100).toFixed(1);

		return {
			isFaster: diff < 0,
			percentage,
			value: diff,
		};
	});

	return (
		<>
			<div class="bg-background shadow-soft rounded-lg p-6">
				<button
					class="bg-foreground hover:bg-foreground/80 disabled:bg-muted-foreground w-full px-6 py-3 font-semibold text-white transition-colors"
					disabled={data.loading}
					onClick={refetch}
					type="button"
				>
					{data.loading ? "Fetching..." : "Run Client-Side Benchmark"}
				</button>

				<Show when={data.error}>
					<div class="border-border bg-error/10 text-destructive mt-4 border p-4">
						Error: {benchmarkErrorMessage(parse(thrownErrorWireSchema, data.error))}
					</div>
				</Show>
			</div>

			<div class="border-border bg-card shadow-soft rounded-lg border p-6">
				<div class="mb-4 flex items-center gap-2">
					<IconComputer class="text-primary h-6 w-6" />
					<h2 class="text-foreground text-2xl font-bold">Client-Side (CSR)</h2>
				</div>

				<Show
					fallback={
						<div class="flex h-64 items-center justify-center">
							<div class="text-center">
								<Show
									fallback={<p class="text-muted-foreground">Click the button to run benchmark</p>}
									when={data.loading}
								>
									<div class="border-border border-t-primary mx-auto size-12 animate-spin border-[3px]" />
									<p class="text-muted-foreground mt-4">Fetching data...</p>
								</Show>
							</div>
						</div>
					}
					when={!data.loading && data()}
				>
					<div class="space-y-3">
						<div class="bg-background p-4">
							<p class="text-muted-foreground mb-1 text-sm">Total Fetch Time</p>
							<p class="text-foreground text-3xl font-bold">{formatTime(data()?.fetchTime ?? 0)}</p>
						</div>

						<div class="bg-background p-4">
							<p class="text-muted-foreground mb-1 text-sm">Database Query Time</p>
							<p class="text-foreground text-2xl font-semibold">
								{formatTime(data()?.dbElapsed ?? 0)}
							</p>
						</div>

						<div class="bg-background p-4">
							<p class="text-muted-foreground mb-1 text-sm">Products Fetched</p>
							<p class="text-foreground text-2xl font-semibold">{data()?.productCount}</p>
						</div>

						<Show when={data()?.kvReadElapsed}>
							{(elapsed) => (
								<div class="bg-background p-4">
									<p class="text-muted-foreground mb-1 text-sm">KV Read Time (Client)</p>
									<p class="text-foreground text-2xl font-semibold">{formatTime(elapsed())}</p>
								</div>
							)}
						</Show>

						<Show when={data()?.redisReadElapsed}>
							{(elapsed) => (
								<div class="bg-background p-4">
									<p class="text-muted-foreground mb-1 text-sm">Redis Read Time (Client)</p>
									<p class="text-foreground text-2xl font-semibold">{formatTime(elapsed())}</p>
								</div>
							)}
						</Show>
					</div>

					<div class="bg-primary/20 mt-4 p-3">
						<p class="text-foreground flex items-center gap-1 text-sm font-medium">
							<IconCheck class="h-4 w-4" /> Rendered in browser
						</p>
						<p class="text-foreground mt-1 text-xs">Includes network latency + processing time</p>
					</div>
				</Show>
			</div>

			<Show when={data() && difference()}>
				{(diff) => (
					<BenchmarkPerformanceAnalysis
						data={data()!}
						diff={diff()}
						kvReadTime={props.kvReadTime}
						redisReadTime={props.redisReadTime}
						serverDbTime={props.serverDbTime}
					/>
				)}
			</Show>
		</>
	);
}

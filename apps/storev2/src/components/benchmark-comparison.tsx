import { createMemo, createResource, Show } from "solid-js";
import { api } from "../lib/trpc";
import IconComputer from "~icons/ri/computer-line";
import IconCheck from "~icons/ri/check-line";

interface BenchmarkComparisonProps {
	serverFetchTime: number;
	serverDbTime: number;
	productCount: number;
	kvWriteTime?: number;
	kvReadTime?: number;
}

interface BenchmarkResult {
	dbElapsed: number;
	productCount: number;
	fetchTime: number;
	kvWriteElapsed?: number;
	kvReadElapsed?: number;
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
			<div class="rounded-lg bg-white p-6 shadow-md">
				<button
					type="button"
					onClick={refetch}
					disabled={data.loading}
					class="w-full rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition-colors hover:bg-blue-700 disabled:bg-gray-400"
				>
					{data.loading ? "Fetching..." : "Run Client-Side Benchmark"}
				</button>

				<Show when={data.error}>
					<div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
						Error:{" "}
						{data.error instanceof Error
							? data.error.message
							: "Failed to fetch data"}
					</div>
				</Show>
			</div>

			{/* Client-Side Results */}
			<div class="rounded-lg border-2 border-blue-300 bg-gradient-to-br from-blue-50 to-blue-100 p-6 shadow-md">
				<div class="mb-4 flex items-center gap-2">
					<IconComputer class="h-6 w-6 text-blue-600" />
					<h2 class="font-bold text-2xl text-blue-800">Client-Side (CSR)</h2>
				</div>

				<Show
					when={!data.loading && data()}
					fallback={
						<div class="flex h-64 items-center justify-center">
							<div class="text-center">
								<Show
									when={data.loading}
									fallback={
										<p class="text-gray-500">
											Click the button to run benchmark
										</p>
									}
								>
									<div class="mx-auto h-12 w-12 animate-spin rounded-full border-blue-600 border-b-2" />
									<p class="mt-4 text-blue-600">Fetching data...</p>
								</Show>
							</div>
						</div>
					}
				>
					<div class="space-y-3">
						<div class="rounded-lg bg-white p-4">
							<p class="mb-1 text-gray-600 text-sm">Total Fetch Time</p>
							<p class="font-bold text-3xl text-blue-700">
								{formatTime(data()?.fetchTime ?? 0)}
							</p>
						</div>

						<div class="rounded-lg bg-white p-4">
							<p class="mb-1 text-gray-600 text-sm">Database Query Time</p>
							<p class="font-semibold text-2xl text-blue-600">
								{formatTime(data()?.dbElapsed ?? 0)}
							</p>
						</div>

						<div class="rounded-lg bg-white p-4">
							<p class="mb-1 text-gray-600 text-sm">Products Fetched</p>
							<p class="font-semibold text-2xl text-blue-600">
								{data()?.productCount}
							</p>
						</div>

						<Show when={data()?.kvReadElapsed !== undefined}>
							<div class="rounded-lg bg-white p-4">
								<p class="mb-1 text-gray-600 text-sm">KV Read Time (Client)</p>
								<p class="font-semibold text-2xl text-purple-600">
									{formatTime(data()?.kvReadElapsed!)}
								</p>
							</div>
						</Show>
					</div>

					<div class="mt-4 rounded-lg bg-blue-200 p-3">
						<p class="font-medium text-blue-800 text-sm flex items-center gap-1">
							<IconCheck class="h-4 w-4" /> Rendered in browser
						</p>
						<p class="mt-1 text-blue-700 text-xs">
							Includes network latency + processing time
						</p>
					</div>
				</Show>
			</div>

			{/* Comparison Summary */}
			<Show when={data() && difference()}>
				{(diff) => (
					<div class="rounded-lg bg-white p-6 shadow-md">
						<h3 class="mb-4 font-bold text-xl">Performance Analysis</h3>

						<div class="grid gap-4 md:grid-cols-3">
							<div class="rounded-lg bg-gray-50 p-4">
								<p class="mb-1 text-gray-600 text-sm">Time Difference</p>
								<p
									class={`font-bold text-2xl ${
										diff().isFaster ? "text-green-600" : "text-red-600"
									}`}
								>
									{diff().isFaster ? "-" : "+"}
									{formatTime(Math.abs(diff().value))}
								</p>
							</div>

							<div class="rounded-lg bg-gray-50 p-4">
								<p class="mb-1 text-gray-600 text-sm">Percentage Difference</p>
								<p
									class={`font-bold text-2xl ${
										diff().isFaster ? "text-green-600" : "text-red-600"
									}`}
								>
									{diff().percentage}% {diff().isFaster ? "faster" : "slower"}
								</p>
							</div>

							<div class="rounded-lg bg-gray-50 p-4">
								<p class="mb-1 text-gray-600 text-sm">Network Overhead</p>
								<p class="font-bold text-2xl text-purple-600">
									{formatTime(
										(data()?.fetchTime ?? 0) -
											(data()?.dbElapsed ?? 0) -
											props.serverDbTime,
									)}
								</p>
							</div>
						</div>

						<div class="mt-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
							<h4 class="mb-2 font-semibold text-yellow-800">Key Insights:</h4>
							<ul class="space-y-2 text-sm text-yellow-900">
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
								<Show
									when={
										data()?.kvReadElapsed !== undefined &&
										props.kvReadTime !== undefined
									}
								>
									<li>
										• KV read time: {formatTime(data()?.kvReadElapsed!)}{" "}
										(client) vs {formatTime(props.kvReadTime!)} (server) -
										typically very fast
									</li>
								</Show>
							</ul>
						</div>
					</div>
				)}
			</Show>
		</>
	);
}

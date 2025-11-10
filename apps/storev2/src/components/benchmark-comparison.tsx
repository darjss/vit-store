import { createMemo, createResource, Show } from "solid-js";
import { api } from "../lib/trpc";

interface BenchmarkComparisonProps {
	serverFetchTime: number;
	serverDbTime: number;
	productCount: number;
}

interface BenchmarkResult {
	dbElapsed: number;
	productCount: number;
	fetchTime: number;
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
					<svg
						class="h-6 w-6 text-blue-600"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
						/>
					</svg>
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
								{formatTime(data()!.fetchTime)}
							</p>
						</div>

						<div class="rounded-lg bg-white p-4">
							<p class="mb-1 text-gray-600 text-sm">Database Query Time</p>
							<p class="font-semibold text-2xl text-blue-600">
								{formatTime(data()!.dbElapsed)}
							</p>
						</div>

						<div class="rounded-lg bg-white p-4">
							<p class="mb-1 text-gray-600 text-sm">Products Fetched</p>
							<p class="font-semibold text-2xl text-blue-600">
								{data()!.productCount}
							</p>
						</div>
					</div>

					<div class="mt-4 rounded-lg bg-blue-200 p-3">
						<p class="font-medium text-blue-800 text-sm">
							✓ Rendered in browser
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
										data()!.fetchTime - data()!.dbElapsed - props.serverDbTime,
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
							</ul>
						</div>
					</div>
				)}
			</Show>
		</>
	);
}

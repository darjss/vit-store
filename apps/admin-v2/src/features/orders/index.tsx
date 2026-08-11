/*
 * Orders list page — variant-B card workspace.
 *
 * Search + filters live in typed URL search params (search state in the URL,
 * not component memory — query-client rules). Pending orders are selectable
 * for batch ship. Loading / empty / error / retry states throughout, and
 * filtered-empty states explain what happened.
 */
import { createQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate, useSearch } from "@tanstack/solid-router";
import { BillListIcon } from "@solar-icons/solid/linear/bill-list";
import { CloseCircleIcon } from "@solar-icons/solid/linear/close-circle";
import { RefreshIcon } from "@solar-icons/solid/linear/refresh";
import { RoundedMagnifierIcon } from "@solar-icons/solid/linear/rounded-magnifier";
import { PRODUCT_PER_PAGE, paymentStatus } from "@vit/shared/constants";
import type { OrderStatusType, PaymentStatusType } from "@vit/shared/types";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	on,
	Show,
} from "solid-js";

import {
	Button,
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	EmptyState,
	InlineAlert,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Skeleton,
	showToast,
} from "@vit/ui";

import { BatchShipOrderDialog } from "./batch-ship-dialog";
import type { BatchShipFailure, BatchShipResult } from "./batch-ship-dialog";
import { invalidateOrderCaches } from "./cache";
import { PAYMENT_STATUS_META } from "./labels";
import { orderListQueryOptions } from "./queries";
import type { OrderListInput } from "./queries";
import { OrderCard } from "./order-card";

const ACTIVE_STATUSES: OrderStatusType[] = ["created", "pending", "shipped"];

const STATUS_TABS: Array<{ value: string; label: string }> = [
	{ value: "active", label: "Явагдаж буй" },
	{ value: "created", label: "Шинэ" },
	{ value: "pending", label: "Бэлтгэсэн" },
	{ value: "shipped", label: "Хүргэлтэд" },
	{ value: "delivered", label: "Хүргэгдсэн" },
	{ value: "cancelled", label: "Цуцалсан" },
	{ value: "refunded", label: "Буцаалт" },
	{ value: "all", label: "Бүгд" },
];

const DATE_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "all", label: "Бүх огноо" },
	{ value: "today", label: "Өнөөдөр" },
	{ value: "yesterday", label: "Өчигдөр" },
	{ value: "last7days", label: "Сүүлийн 7 хоног" },
	{ value: "last30days", label: "Сүүлийн 30 хоног" },
];

const PAYMENT_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "all", label: "Бүх төлбөр" },
	...paymentStatus.map((status) => ({
		value: status,
		label: PAYMENT_STATUS_META[status].label,
	})),
];

interface OrdersSearchState {
	page: number;
	pageSize: number;
	searchTerm?: string;
	orderStatus: string;
	paymentStatus?: PaymentStatusType;
	date: string;
	sortField?: string;
	sortDirection?: "asc" | "desc";
}

function parsePositiveInt(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

function readSearchState(raw: Record<string, unknown>): OrdersSearchState {
	const orderStatus =
		typeof raw.orderStatus === "string" ? raw.orderStatus : "active";
	const paymentStatusRaw =
		typeof raw.paymentStatus === "string" ? raw.paymentStatus : undefined;
	const sortDirectionRaw =
		typeof raw.sortDirection === "string" ? raw.sortDirection : undefined;
	return {
		page: parsePositiveInt(raw.page) ?? 1,
		pageSize: parsePositiveInt(raw.pageSize) ?? PRODUCT_PER_PAGE,
		searchTerm: typeof raw.searchTerm === "string" ? raw.searchTerm : undefined,
		orderStatus,
		paymentStatus: paymentStatusRaw as PaymentStatusType | undefined,
		date: typeof raw.date === "string" ? raw.date : "all",
		sortField: typeof raw.sortField === "string" ? raw.sortField : undefined,
		sortDirection:
			sortDirectionRaw === "asc" || sortDirectionRaw === "desc"
				? sortDirectionRaw
				: undefined,
	};
}

function buildListInput(state: OrdersSearchState): OrderListInput {
	return {
		page: state.page,
		pageSize: state.pageSize,
		includeAllStatuses: state.orderStatus === "all",
		orderStatus:
			state.orderStatus === "all" || state.orderStatus === "active"
				? undefined
				: (state.orderStatus as OrderStatusType),
		orderStatuses: state.orderStatus === "active" ? ACTIVE_STATUSES : undefined,
		paymentStatus: state.paymentStatus,
		searchTerm: state.searchTerm,
		sortField: state.sortField,
		sortDirection: state.sortDirection,
		date: state.date === "all" ? undefined : state.date,
	};
}

function statusTabLabel(value: string): string {
	return STATUS_TABS.find((tab) => tab.value === value)?.label ?? value;
}

/** Date / payment / sort row. */
function SecondaryFilters(props: {
	date: string;
	paymentStatus?: PaymentStatusType;
	sortField?: string;
	sortDirection?: "asc" | "desc";
	hasActiveFilters: boolean;
	onDateChange: (value: string) => void;
	onPaymentChange: (value: string) => void;
	onSort: (field: "total" | "createdAt") => void;
	onReset: () => void;
}) {
	return (
		<div class="flex flex-wrap items-center gap-2">
			<Select
				options={DATE_OPTIONS}
				optionValue={(option) => option.value}
				optionTextValue={(option) => option.label}
				itemComponent={(selectProps) => (
					<SelectItem item={selectProps.item}>
						{selectProps.item.rawValue.label}
					</SelectItem>
				)}
				value={
					DATE_OPTIONS.find((option) => option.value === props.date) ?? null
				}
				onChange={(option) => {
					if (option) props.onDateChange(option.value);
				}}
				placeholder="Бүх огноо"
				aria-label="Огноо шүүлтүүр"
			>
				<SelectTrigger class="h-10 w-auto gap-2 px-3 text-xs">
					<SelectValue<(typeof DATE_OPTIONS)[number]>>
						{(selectState) =>
							selectState.selectedOption()?.label ?? "Бүх огноо"
						}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>

			<Select
				options={PAYMENT_OPTIONS}
				optionValue={(option) => option.value}
				optionTextValue={(option) => option.label}
				itemComponent={(selectProps) => (
					<SelectItem item={selectProps.item}>
						{selectProps.item.rawValue.label}
					</SelectItem>
				)}
				value={
					PAYMENT_OPTIONS.find(
						(option) => option.value === (props.paymentStatus ?? "all"),
					) ?? null
				}
				onChange={(option) => {
					if (option) props.onPaymentChange(option.value);
				}}
				placeholder="Бүх төлбөр"
				aria-label="Төлбөрийн төлөв шүүлтүүр"
			>
				<SelectTrigger class="h-10 w-auto gap-2 px-3 text-xs">
					<SelectValue<(typeof PAYMENT_OPTIONS)[number]>>
						{(selectState) =>
							selectState.selectedOption()?.label ?? "Бүх төлбөр"
						}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>

			<fieldset class="flex items-center gap-1.5">
				<legend class="sr-only">Эрэмбэлэх</legend>
				<Button
					variant={props.sortField === "total" ? "secondary" : "outline"}
					size="compact"
					onClick={() => props.onSort("total")}
				>
					Нийт{" "}
					{props.sortField === "total"
						? props.sortDirection === "asc"
							? "↑"
							: "↓"
						: ""}
				</Button>
				<Button
					variant={props.sortField === "createdAt" ? "secondary" : "outline"}
					size="compact"
					onClick={() => props.onSort("createdAt")}
				>
					Огноо{" "}
					{props.sortField === "createdAt"
						? props.sortDirection === "asc"
							? "↑"
							: "↓"
						: ""}
				</Button>
				<Show when={props.hasActiveFilters}>
					<Button variant="ghost" size="compact" onClick={props.onReset}>
						Цэвэрлэх
					</Button>
				</Show>
			</fieldset>
		</div>
	);
}

/** Scrollable status filter pills. */
function OrderStatusTabs(props: {
	activeValue: string;
	onChange: (value: string) => void;
}) {
	return (
		<div
			class="flex gap-1.5 overflow-x-auto pb-1"
			role="tablist"
			aria-label="Захиалгын төлөв шүүлтүүр"
		>
			<For each={STATUS_TABS}>
				{(tab) => {
					const active = () => props.activeValue === tab.value;
					return (
						<button
							type="button"
							role="tab"
							aria-selected={active()}
							onClick={() => props.onChange(tab.value)}
							class={`h-10 shrink-0 rounded-full border px-4 font-bold text-[13px] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 ${
								active()
									? "border-ink bg-ink text-canvas"
									: "border-rule bg-surface text-ink hover:border-ink/40"
							}`}
						>
							{tab.label}
						</button>
					);
				}}
			</For>
		</div>
	);
}

/** Filtered-empty state explains what happened and points forward. */
function OrdersEmptyState(props: {
	searchTerm?: string;
	hasActiveFilters: boolean;
	statusLabel: string;
	onClearSearch: () => void;
	onResetFilters: () => void;
	onRefetch: () => void;
}) {
	if (props.searchTerm !== undefined) {
		return (
			<EmptyState
				icon={<BillListIcon />}
				title={`«${props.searchTerm}» олдсонгүй`}
				description="Захиалгын дугаар, утас эсвэл хаягаар хайлтаа өөрчилнө үү."
				action={
					<Button variant="secondary" onClick={props.onClearSearch}>
						Хайлт цэвэрлэх
					</Button>
				}
			/>
		);
	}
	if (props.hasActiveFilters) {
		return (
			<EmptyState
				icon={<BillListIcon />}
				title="Шүүлтүүр тохирох захиалга олдсонгүй"
				description={`${props.statusLabel} төлөвийн шүүлтүүрээр захиалга байхгүй байна.`}
				action={
					<Button variant="secondary" onClick={props.onResetFilters}>
						Шүүлтүүр цэвэрлэх
					</Button>
				}
			/>
		);
	}
	return (
		<EmptyState
			icon={<BillListIcon />}
			title="Захиалга олдсонгүй"
			description="Шинэ захиалга ирэхэд энэ жагсаалтад харагдана."
			action={
				<Button variant="secondary" onClick={props.onRefetch}>
					<RefreshIcon /> Дахин ачаалах
				</Button>
			}
		/>
	);
}

/** Sticky batch toolbar — floats above the bottom nav, shows the count. */
function BatchToolbar(props: {
	selectedCount: number;
	canShip: boolean;
	onClear: () => void;
	onShip: () => void;
}) {
	return (
		<div class="sticky bottom-[84px] z-30 md:bottom-4">
			<div class="flex items-center justify-between gap-3 rounded-xl border border-rule bg-ink p-3 text-canvas shadow-pop">
				<div class="min-w-0">
					<p class="font-bold text-sm tabular-nums">
						{props.selectedCount} сонгогдсон
					</p>
					<p class="text-canvas/60 text-xs">Зөвхөн хүлээгдэж буй захиалга</p>
				</div>
				<div class="flex shrink-0 items-center gap-2">
					<Button
						variant="ghost"
						size="compact"
						class="text-canvas hover:bg-canvas/10"
						onClick={props.onClear}
					>
						Цэвэрлэх
					</Button>
					<Button
						variant="primary"
						size="compact"
						disabled={!props.canShip}
						onClick={props.onShip}
					>
						TU руу илгээх
					</Button>
				</div>
			</div>
		</div>
	);
}

/** Per-order failures from a batch ship. */
function BatchFailuresDialog(props: {
	failed: BatchShipFailure[] | null;
	onClose: () => void;
}) {
	return (
		<Dialog open={props.failed !== null} onOpenChange={props.onClose}>
			<DialogContent class="max-w-sm">
				<DialogHeader>
					<DialogTitle>Илгээж чадсангүй</DialogTitle>
					<DialogDescription>
						Дараах захиалгуудыг дахин оролдоно уу.
					</DialogDescription>
				</DialogHeader>
				<ul class="grid gap-2">
					<For each={props.failed ?? []}>
						{(row) => (
							<li class="rounded-ui border border-rule bg-surface-2/60 px-3 py-2">
								<p class="flex items-center gap-1.5 font-bold text-ink text-sm">
									<CloseCircleIcon class="size-4 shrink-0 text-coral-ink" />#
									{row.orderNumber}
								</p>
								<p class="mt-0.5 text-ink-2 text-xs leading-relaxed">
									{row.message}
								</p>
							</li>
						)}
					</For>
				</ul>
				<div class="flex justify-end">
					<Button variant="ghost" onClick={props.onClose}>
						Хаах
					</Button>
				</div>
				<DialogCloseButton aria-label="Хаах" />
			</DialogContent>
		</Dialog>
	);
}

export function OrdersPage() {
	const rawSearch = useSearch({ from: "/_app/orders/" });
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const state = createMemo(() =>
		readSearchState(rawSearch() as unknown as Record<string, unknown>),
	);
	const listInput = createMemo(() => buildListInput(state()));
	const listQuery = createQuery(() => orderListQueryOptions(listInput()));

	const [searchInput, setSearchInput] = createSignal(state().searchTerm ?? "");
	const [selectedIds, setSelectedIds] = createSignal<Set<number>>(new Set());
	const [batchOpen, setBatchOpen] = createSignal(false);
	const [batchFailed, setBatchFailed] = createSignal<BatchShipFailure[] | null>(
		null,
	);

	// `.data` suspends while the query is loading (Solid Query resource); gate
	// every read behind isSuccess so there is no suspension without a boundary.
	const orders = () => (listQuery.isSuccess ? listQuery.data.orders : []);
	const pagination = () =>
		listQuery.isSuccess ? listQuery.data.pagination : undefined;

	const pendingOnPage = createMemo(() =>
		orders().filter((order) => order.status === "pending"),
	);
	const selectedPendingIds = createMemo(() =>
		pendingOnPage()
			.filter((order) => selectedIds().has(order.id))
			.map((order) => order.id),
	);
	const allPendingSelected = createMemo(
		() =>
			pendingOnPage().length > 0 &&
			pendingOnPage().every((order) => selectedIds().has(order.id)),
	);

	const hasActiveFilters = createMemo(
		() =>
			state().orderStatus !== "active" ||
			state().searchTerm !== undefined ||
			state().paymentStatus !== undefined ||
			state().date !== "all" ||
			state().sortField !== undefined,
	);

	// Selection is ephemeral UI state — drop it whenever the visible set
	// changes (filters, page, search, sort).
	createEffect(
		on(
			() => state(),
			() => {
				setSelectedIds(new Set<number>());
				setBatchOpen(false);
			},
		),
	);

	const updateSearch = (patch: Partial<OrdersSearchState>) => {
		const current = state();
		navigate({
			to: "/orders",
			search: {
				page: patch.page ?? current.page,
				pageSize: patch.pageSize ?? current.pageSize,
				searchTerm: patch.searchTerm ?? current.searchTerm,
				orderStatus: patch.orderStatus ?? current.orderStatus,
				paymentStatus: patch.paymentStatus ?? current.paymentStatus,
				date: patch.date ?? current.date,
				sortField: patch.sortField ?? current.sortField,
				sortDirection: patch.sortDirection ?? current.sortDirection,
			},
		});
	};

	const handleSearchSubmit = () => {
		const term = searchInput().trim();
		updateSearch({ page: 1, searchTerm: term || undefined });
	};

	const clearSearch = () => {
		setSearchInput("");
		updateSearch({ page: 1, searchTerm: undefined });
	};

	const handleStatusChange = (value: string) => {
		updateSearch({ page: 1, orderStatus: value });
	};

	const handleDateChange = (value: string) => {
		updateSearch({ page: 1, date: value });
	};

	const handlePaymentChange = (value: string) => {
		updateSearch({
			page: 1,
			paymentStatus: value === "all" ? undefined : (value as PaymentStatusType),
		});
	};

	const handleSort = (field: "total" | "createdAt") => {
		const current = state();
		const direction =
			current.sortField === field && current.sortDirection === "asc"
				? "desc"
				: "asc";
		updateSearch({
			page: current.page,
			sortField: field,
			sortDirection: direction,
		});
	};

	const resetFilters = () => {
		setSearchInput("");
		navigate({
			to: "/orders",
			search: {
				page: 1,
				orderStatus: "active",
				paymentStatus: undefined,
				date: "all",
				sortField: undefined,
				sortDirection: undefined,
				searchTerm: undefined,
			},
		});
	};

	const toggleSelectAllPending = () => {
		setSelectedIds(
			allPendingSelected()
				? new Set<number>()
				: new Set(pendingOnPage().map((order) => order.id)),
		);
	};

	const toggleSelect = (id: number, checked: boolean) => {
		setSelectedIds((current) => {
			const next = new Set(current);
			if (checked) next.add(id);
			else next.delete(id);
			return next;
		});
	};

	const clearSelection = () => {
		setSelectedIds(new Set<number>());
		setBatchOpen(false);
	};

	const handleBatchComplete = (result: BatchShipResult) => {
		void invalidateOrderCaches(queryClient);
		const okCount = result.total - result.failed.length;
		if (result.failed.length === 0) {
			clearSelection();
			showToast({
				title: `${okCount} захиалгыг TU руу илгээлээ`,
				variant: "success",
			});
			return;
		}
		setSelectedIds(new Set(result.failed.map((row) => row.orderId)));
		setBatchFailed(result.failed);
		showToast({
			title:
				okCount > 0
					? `${okCount} амжилттай, ${result.failed.length} алдаатай`
					: "Илгээлт амжилтгүй",
			variant: okCount > 0 ? "info" : "error",
		});
	};

	const selectedOrdersForBatch = createMemo(() => {
		const ids = selectedPendingIds();
		return orders().filter((order) => ids.includes(order.id));
	});

	return (
		<div class="grid gap-4">
			<header>
				<h1 class="font-extrabold text-2xl text-ink tracking-tight">
					Захиалгууд
				</h1>
				<p class="mt-1 text-[13px] text-ink-2">
					Төлөвийн дагуу хийх үйлдэл, хайлт, багц илгээлт
				</p>
			</header>

			{/* Search */}
			<div class="grid gap-2">
				<div class="relative">
					<RoundedMagnifierIcon class="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-2" />
					<input
						type="search"
						value={searchInput()}
						onInput={(event) => setSearchInput(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") handleSearchSubmit();
						}}
						placeholder="Захиалгын дугаар, утас хайх..."
						aria-label="Захиалга хайх"
						class="h-12 w-full rounded-ui border border-rule bg-surface pr-3 pl-10 font-medium text-base text-ink outline-none placeholder:text-ink-2/50 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
					/>
				</div>
				<Show when={searchInput().trim().length > 0}>
					<div class="flex items-center justify-between gap-2">
						<p class="text-ink-2 text-xs">
							{state().searchTerm !== undefined &&
							searchInput().trim() === state().searchTerm
								? `«${state().searchTerm}» хайж байна`
								: "Enter дарж хайна"}
						</p>
						<div class="flex items-center gap-1.5">
							<Button variant="ghost" size="compact" onClick={clearSearch}>
								Цэвэрлэх
							</Button>
							<Button size="compact" onClick={handleSearchSubmit}>
								Хайх
							</Button>
						</div>
					</div>
				</Show>
			</div>

			{/* Status tabs */}
			<OrderStatusTabs
				activeValue={state().orderStatus}
				onChange={handleStatusChange}
			/>

			{/* Secondary filters */}
			<SecondaryFilters
				date={state().date}
				paymentStatus={state().paymentStatus}
				sortField={state().sortField}
				sortDirection={state().sortDirection}
				hasActiveFilters={hasActiveFilters()}
				onDateChange={handleDateChange}
				onPaymentChange={handlePaymentChange}
				onSort={handleSort}
				onReset={resetFilters}
			/>

			{/* Select-all pending row */}
			<Show when={pendingOnPage().length > 0}>
				<label class="flex cursor-pointer items-center gap-2.5 rounded-ui border border-rule bg-surface px-3.5 py-3">
					<input
						type="checkbox"
						checked={allPendingSelected()}
						onChange={toggleSelectAllPending}
						aria-label="Энэ хуудсан дээрх бүх хүлээгдэж буй захиалгыг сонгох"
						class="size-5 accent-butter"
					/>
					<span class="text-ink-2 text-sm">
						Хүлээгдэж буй{" "}
						<span class="font-bold text-ink">{pendingOnPage().length}</span>{" "}
						сонгох
					</span>
				</label>
			</Show>

			{/* List states */}
			<Show when={listQuery.isPending}>
				<div class="grid gap-3">
					<For each={[0, 1, 2, 3]}>
						{() => <Skeleton class="h-48 w-full" />}
					</For>
				</div>
			</Show>

			<Show when={listQuery.isError && !listQuery.isFetching}>
				<InlineAlert tone="error">
					Захиалгуудыг ачаалж чадсангүй. Холболтоо шалгаад дахин оролдоно уу.
				</InlineAlert>
				<Button
					variant="secondary"
					class="w-full"
					onClick={() => listQuery.refetch()}
				>
					<RefreshIcon /> Дахин оролдох
				</Button>
			</Show>

			<Show when={listQuery.isSuccess && orders().length === 0}>
				<OrdersEmptyState
					searchTerm={state().searchTerm}
					hasActiveFilters={hasActiveFilters()}
					statusLabel={statusTabLabel(state().orderStatus)}
					onClearSearch={clearSearch}
					onResetFilters={resetFilters}
					onRefetch={() => listQuery.refetch()}
				/>
			</Show>

			<Show when={listQuery.isSuccess && orders().length > 0}>
				<div class="grid gap-3 md:grid-cols-2">
					<For each={orders()}>
						{(order) => (
							<OrderCard
								order={order}
								selectable={order.status === "pending"}
								selected={selectedIds().has(order.id)}
								onSelectionChange={(checked) => toggleSelect(order.id, checked)}
							/>
						)}
					</For>
				</div>
			</Show>

			{/* Pagination */}
			<Show when={pagination()} fallback={null}>
				{(paginationData) => (
					<nav
						class="flex flex-wrap items-center justify-between gap-3 pt-1"
						aria-label="Хуудаслалт"
					>
						<p class="text-ink-2 text-xs tabular-nums">
							{paginationData().totalCount} захиалга · Хуудас{" "}
							{paginationData().currentPage} / {paginationData().totalPages}
						</p>
						<div class="flex items-center gap-2">
							<Button
								variant="outline"
								size="compact"
								disabled={!paginationData().hasPreviousPage}
								onClick={() =>
									updateSearch({ page: paginationData().currentPage - 1 })
								}
							>
								Өмнөх
							</Button>
							<Button
								variant="outline"
								size="compact"
								disabled={!paginationData().hasNextPage}
								onClick={() =>
									updateSearch({ page: paginationData().currentPage + 1 })
								}
							>
								Дараах
							</Button>
						</div>
					</nav>
				)}
			</Show>

			{/* Batch toolbar — sticky above the bottom nav */}
			<Show when={selectedIds().size > 0}>
				<BatchToolbar
					selectedCount={selectedIds().size}
					canShip={selectedPendingIds().length > 0}
					onClear={clearSelection}
					onShip={() => setBatchOpen(true)}
				/>
			</Show>

			<BatchShipOrderDialog
				open={batchOpen()}
				orders={selectedOrdersForBatch()}
				onOpenChange={setBatchOpen}
				onComplete={handleBatchComplete}
			/>

			<BatchFailuresDialog
				failed={batchFailed()}
				onClose={() => setBatchFailed(null)}
			/>
		</div>
	);
}

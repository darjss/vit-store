import { useNavigate } from "@tanstack/react-router";
import { paymentStatus as paymentStatusConstants } from "@vit/shared/constants";
import { Calendar as CalendarIcon, RotateCcw } from "lucide-react";
import { useState } from "react";
import { chipClass, FilterChip } from "@/components/filter-chip";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { paymentStatusLabel } from "@/lib/enum-labels";
import { labelForOrderStatus } from "@/lib/order-status-display";
import { cn } from "@/lib/utils";

// en-CA formats as YYYY-MM-DD, the day key the orders filter expects.
const ubDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" });

const statusTabs = [
	"active",
	"pending",
	"shipped",
	"delivered",
	"created",
	"cancelled",
	"refunded",
	"all",
] as const;

const datePresets = [
	{ label: "Бүх өдөр", value: "all" },
	{ label: "Өнөөдөр", value: "today" },
	{ label: "Өчигдөр", value: "yesterday" },
	{ label: "Сүүлийн 7 хоног", value: "last7days" },
	{ label: "Сүүлийн 30 хоног", value: "last30days" },
] as const;

const sortOptions = [
	{ label: "Шинэ нь эхэндээ", value: "createdAt:desc" },
	{ label: "Хуучин нь эхэндээ", value: "createdAt:asc" },
	{ label: "Дүн ихээс", value: "total:desc" },
	{ label: "Дүн багаас", value: "total:asc" },
] as const;

const paymentOptions = [
	{ label: "Бүх төлбөр", value: "all" },
	...paymentStatusConstants.map((status) => ({ label: paymentStatusLabel[status], value: status })),
];

function formatStatusLabel(status: string) {
	if (status === "all") {
		return "Бүгд";
	}
	if (status === "active") {
		return "Явагдаж буй";
	}
	return labelForOrderStatus(status);
}

interface OrdersFiltersProps {
	date?: string;
	filtersActive: boolean;
	onFilterChange: (field: string, value: string) => void;
	onResetFilters: () => void;
	onSortChange: (field: string, direction: "asc" | "desc") => void;
	orderStatus?: string;
	pageSize: number;
	paymentStatus?: string;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
}

export default function OrdersFilters({
	date = "all",
	filtersActive,
	onFilterChange,
	onResetFilters,
	onSortChange,
	orderStatus = "active",
	pageSize,
	paymentStatus,
	searchTerm,
	sortDirection,
	sortField,
}: OrdersFiltersProps) {
	const navigate = useNavigate({ from: "/orders" });
	const [isDateOpen, setIsDateOpen] = useState(false);
	const isPreset = datePresets.some((preset) => preset.value === date);
	const selectedDate = isPreset ? undefined : new Date(`${date}T00:00:00+08:00`);
	const sortValue = `${sortField ?? "createdAt"}:${sortDirection ?? "desc"}`;

	const setDate = (value: string) => {
		navigate({
			search: {
				date: value,
				orderStatus,
				page: 1,
				pageSize,
				paymentStatus,
				searchTerm,
				sortDirection,
				sortField,
			},
			to: "/orders",
		});
	};

	return (
		<div className="space-y-2.5">
			<div className="-mx-3 flex [scrollbar-width:none] overflow-x-auto border-b px-3 md:mx-0 md:px-0">
				{statusTabs.map((status) => {
					const isActive = orderStatus === status;
					return (
						<button
							className={cn(
								"-mb-px h-10 shrink-0 border-b-[3px] px-3 text-sm whitespace-nowrap",
								isActive
									? "border-foreground text-foreground font-semibold"
									: "text-muted-foreground hover:text-foreground border-transparent",
							)}
							key={status}
							onClick={() => onFilterChange("orderStatus", status)}
							type="button"
						>
							{formatStatusLabel(status)}
						</button>
					);
				})}
			</div>

			<div className="-mx-3 flex [scrollbar-width:none] items-center gap-2 overflow-x-auto px-3 md:mx-0 md:px-0">
				{isPreset ? (
					<FilterChip
						idle="all"
						label="Огноо"
						onChange={setDate}
						options={datePresets}
						value={date}
					/>
				) : (
					<button className={chipClass(true)} onClick={() => setDate("all")} type="button">
						{selectedDate?.toLocaleDateString("mn-MN", {
							day: "numeric",
							month: "short",
							timeZone: "Asia/Ulaanbaatar",
						})}{" "}
						✕
					</button>
				)}
				<Popover onOpenChange={setIsDateOpen} open={isDateOpen}>
					<PopoverTrigger aria-label="Өдөр сонгох" className={cn(chipClass(false), "px-2.5")}>
						<CalendarIcon className="size-4" />
					</PopoverTrigger>
					<PopoverContent align="start" className="w-auto border p-0">
						<Calendar
							components={{ DayButton: CalendarDayButton }}
							mode="single"
							onSelect={(day) => {
								if (day) {
									setDate(ubDay.format(day));
								}
								setIsDateOpen(false);
							}}
							selected={selectedDate}
						/>
					</PopoverContent>
				</Popover>
				<FilterChip
					idle="all"
					label="Төлбөр"
					onChange={(value) => onFilterChange("paymentStatus", value)}
					options={paymentOptions}
					value={paymentStatus ?? "all"}
				/>
				<FilterChip
					idle="createdAt:desc"
					label="Эрэмбэ"
					onChange={(value) => {
						const [field, direction] = value.split(":");
						onSortChange(field ?? "createdAt", direction === "asc" ? "asc" : "desc");
					}}
					options={sortOptions}
					value={sortValue}
				/>
				{filtersActive && (
					<button
						className="text-muted-foreground hover:text-foreground flex h-9 shrink-0 items-center gap-1.5 px-2 text-sm"
						onClick={onResetFilters}
						type="button"
					>
						<RotateCcw className="size-3.5" />
						Цэвэрлэх
					</button>
				)}
			</div>
		</div>
	);
}

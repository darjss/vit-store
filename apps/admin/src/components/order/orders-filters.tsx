import { useNavigate } from "@tanstack/react-router";
import {
	Calendar as CalendarIcon,
	ChevronDown,
	RotateCcw,
} from "lucide-react";
import { useState } from "react";
import {
	orderStatus as orderStatusConstants,
	paymentStatus as paymentStatusConstants,
} from "@vit/shared/constants";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

const primaryStatuses = [undefined, "pending", "shipped", "delivered"] as const;
const issueStatuses = ["created", "cancelled", "refunded"] as const;

const datePresets = [
	{ value: "all", label: "Бүгд" },
	{ value: "today", label: "Өнөөдөр" },
	{ value: "yesterday", label: "Өчигдөр" },
	{ value: "last7days", label: "7 хоног" },
	{ value: "last30days", label: "30 хоног" },
] as const;

function formatStatusLabel(status?: string) {
	if (!status) return "Бүгд";
	const labels: Record<string, string> = {
		created: "Төлөөгүй",
		pending: "Хүлээгдэж буй",
		shipped: "Илгээгдсэн",
		delivered: "Хүргэгдсэн",
		cancelled: "Цуцлагдсан",
		refunded: "Буцаагдсан",
	};
	return labels[status] ?? status;
}

interface OrdersFiltersProps {
	date?: string;
	orderStatus?: string;
	paymentStatus?: string;
	pageSize: number;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
	filtersActive: boolean;
	onFilterChange: (field: string, value: string) => void;
	onResetFilters: () => void;
	onSort: (field: string) => void;
}

export default function OrdersFilters({
	date,
	orderStatus,
	paymentStatus,
	pageSize,
	searchTerm,
	sortDirection,
	sortField,
	filtersActive,
	onFilterChange,
	onResetFilters,
	onSort,
}: OrdersFiltersProps) {
	const navigate = useNavigate({ from: "/orders" });
	const [isDateOpen, setIsDateOpen] = useState(false);
	const isCustomDate =
		date !== undefined &&
		date !== "all" &&
		date !== "today" &&
		date !== "yesterday" &&
		date !== "last7days" &&
		date !== "last30days";
	const selectedDate = isCustomDate
		? new Date(`${date}T00:00:00+08:00`)
		: undefined;

	const isIssueActive =
		orderStatus === "created" ||
		orderStatus === "cancelled" ||
		orderStatus === "refunded";

	const handleDatePreset = (preset: string) => {
		navigate({
			to: "/orders",
			search: {
				date: preset,
				orderStatus,
				page: 1,
				pageSize,
				paymentStatus,
				searchTerm,
				sortDirection,
				sortField,
			},
		});
	};

	const handleCustomDateSelect = (selectedDate: Date | undefined) => {
		if (selectedDate) {
			const dateStr = selectedDate.toISOString().split("T")[0];
			navigate({
				to: "/orders",
				search: {
					date: dateStr,
					orderStatus,
					page: 1,
					pageSize,
					paymentStatus,
					searchTerm,
					sortDirection,
					sortField,
				},
			});
		}
		setIsDateOpen(false);
	};

	return (
		<div className="space-y-4">
			{/* Status tabs — primary + issues dropdown */}
			<div className="scrollbar-thin flex gap-1 overflow-x-auto pb-1">
				{primaryStatuses.map((status) => {
					const value = status ?? "all";
					const isActive = (orderStatus ?? "all") === value;
					return (
						<Button
							key={value}
							variant={isActive ? "default" : "outline"}
							size="sm"
							onClick={() => onFilterChange("orderStatus", value)}
							className={`h-10 shrink-0 px-4 text-xs font-bold sm:text-sm ${
								isActive ? "shadow-hard" : "shadow-hard-sm"
							}`}
						>
							{formatStatusLabel(status)}
						</Button>
					);
				})}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant={isIssueActive ? "default" : "outline"}
							size="sm"
							className={`h-10 shrink-0 gap-1 px-3 text-xs font-bold sm:text-sm ${
								isIssueActive ? "shadow-hard" : "shadow-hard-sm"
							}`}
						>
							Асуудалтай
							<ChevronDown className="h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="border-2 border-border bg-card shadow-hard"
					>
						{issueStatuses.map((status) => (
							<DropdownMenuItem
								key={status}
								onClick={() => onFilterChange("orderStatus", status)}
								className={`py-2.5 font-bold ${
									orderStatus === status
										? "bg-primary text-primary-foreground"
										: ""
								}`}
							>
								{formatStatusLabel(status)}
							</DropdownMenuItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>

			{/* Secondary filters row */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
				<div className="flex flex-wrap items-center gap-1.5">
					{datePresets.map((preset) => {
						const isActive =
							date === preset.value || (!date && preset.value === "all");
						return (
							<Button
								key={preset.value}
								variant={isActive ? "default" : "outline"}
								size="sm"
								onClick={() => handleDatePreset(preset.value)}
								className={`h-9 px-2.5 text-xs ${
									isActive ? "shadow-hard" : "shadow-hard-sm"
								}`}
							>
								{preset.label}
							</Button>
						);
					})}
					<Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
						<PopoverTrigger asChild>
							<Button
								variant={isCustomDate ? "default" : "outline"}
								size="sm"
								className={`h-9 w-9 p-0 ${
									isCustomDate ? "shadow-hard" : "shadow-hard-sm"
								}`}
								aria-label="Огноо сонгох"
							>
								<CalendarIcon className="h-3.5 w-3.5" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-auto p-0" align="start">
							<Calendar
								mode="single"
								selected={selectedDate}
								onSelect={handleCustomDateSelect}
								components={{ DayButton: CalendarDayButton }}
							/>
						</PopoverContent>
					</Popover>
				</div>

				<div className="flex items-center gap-2 sm:ml-auto">
					<Select
						value={paymentStatus ?? "all"}
						onValueChange={(value) =>
							onFilterChange("paymentStatus", value)
						}
					>
						<SelectTrigger className="h-9 w-[150px] text-xs shadow-hard-sm">
							<SelectValue placeholder="Төлбөр" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Бүх төлбөр</SelectItem>
							{paymentStatusConstants.map((status) => (
								<SelectItem key={status} value={status}>
									{status === "customer_claimed_paid"
										? "Төлсөн гэж мэдэгдсэн"
										: status === "success"
											? "Төлсөн"
											: status === "failed"
												? "Амжилтгүй"
												: "Хүлээгдэж буй"}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="h-6 w-px bg-border" />

					<Button
						variant={sortField === "total" ? "default" : "outline"}
						size="sm"
						onClick={() => onSort("total")}
						className={`h-9 gap-1 px-3 text-xs ${
							sortField === "total" ? "shadow-hard" : "shadow-hard-sm"
						}`}
					>
						Нийт
						{sortField === "total" &&
							(sortDirection === "asc" ? (
								<span className="text-[10px]">↑</span>
							) : (
								<span className="text-[10px]">↓</span>
							))}
					</Button>
					<Button
						variant={sortField === "createdAt" ? "default" : "outline"}
						size="sm"
						onClick={() => onSort("createdAt")}
						className={`h-9 gap-1 px-3 text-xs ${
							sortField === "createdAt" ? "shadow-hard" : "shadow-hard-sm"
						}`}
					>
						Огноо
						{sortField === "createdAt" &&
							(sortDirection === "asc" ? (
								<span className="text-[10px]">↑</span>
							) : (
								<span className="text-[10px]">↓</span>
							))}
					</Button>

					{filtersActive && (
						<Button
							variant="ghost"
							size="sm"
							onClick={onResetFilters}
							className="hidden h-9 gap-1.5 sm:flex"
						>
							<RotateCcw className="h-3.5 w-3.5" />
							Цэвэрлэх
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}

import { useNavigate } from "@tanstack/react-router";
import { paymentStatus as paymentStatusConstants } from "@vit/shared/constants";
import { Calendar as CalendarIcon, ChevronDown, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { paymentStatusLabel } from "@/lib/enum-labels";
import { labelForOrderStatus } from "@/lib/order-status-display";

const primaryStatuses = ["active", "pending", "shipped", "delivered", "all"] as const;
const issueStatuses = ["created", "cancelled", "refunded"] as const;

const datePresets = [
	{ label: "Бүгд", value: "all" },
	{ label: "Өнөөдөр", value: "today" },
	{ label: "Өчигдөр", value: "yesterday" },
	{ label: "7 хоног", value: "last7days" },
	{ label: "30 хоног", value: "last30days" },
] as const;

function formatStatusLabel(status?: string) {
	if (!status || status === "all") {
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
	onSort: (field: string) => void;
	orderStatus?: string;
	pageSize: number;
	paymentStatus?: string;
	searchTerm?: string;
	sortDirection?: "asc" | "desc";
	sortField?: string;
}

export default function OrdersFilters({
	date,
	filtersActive,
	onFilterChange,
	onResetFilters,
	onSort,
	orderStatus,
	pageSize,
	paymentStatus,
	searchTerm,
	sortDirection,
	sortField,
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
	const selectedDate = isCustomDate ? new Date(`${date}T00:00:00+08:00`) : undefined;

	const isIssueActive =
		orderStatus === "created" || orderStatus === "cancelled" || orderStatus === "refunded";

	const handleDatePreset = (preset: string) => {
		navigate({
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
			to: "/orders",
		});
	};

	const handleCustomDateSelect = (selectedDate: Date | undefined) => {
		if (selectedDate) {
			const dateStr = selectedDate.toISOString().split("T")[0];
			navigate({
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
				to: "/orders",
			});
		}
		setIsDateOpen(false);
	};

	return (
		<div className="space-y-4">
			{/* Status tabs — primary + issues dropdown */}
			<div className="flex scrollbar-thin gap-1 overflow-x-auto pb-1">
				{primaryStatuses.map((status) => {
					const value = status;
					const isActive = orderStatus === value;
					return (
						<Button
							className={`h-10 shrink-0 px-4 text-xs font-bold sm:text-sm ${
								isActive ? "shadow-hard" : "shadow-hard-sm"
							}`}
							key={value}
							onClick={() => onFilterChange("orderStatus", value)}
							size="sm"
							variant={isActive ? "default" : "outline"}
						>
							{formatStatusLabel(status)}
						</Button>
					);
				})}

				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							className={`h-10 shrink-0 gap-1 px-3 text-xs font-bold sm:text-sm ${
								isIssueActive ? "shadow-hard" : "shadow-hard-sm"
							}`}
							size="sm"
							variant={isIssueActive ? "default" : "outline"}
						>
							Асуудалтай
							<ChevronDown className="h-3.5 w-3.5" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start" className="border-border bg-card shadow-hard border-2">
						{issueStatuses.map((status) => (
							<DropdownMenuItem
								className={`py-2.5 font-bold ${
									orderStatus === status ? "bg-primary text-primary-foreground" : ""
								}`}
								key={status}
								onClick={() => onFilterChange("orderStatus", status)}
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
						const isActive = date === preset.value || (!date && preset.value === "all");
						return (
							<Button
								className={`h-9 px-2.5 text-xs ${isActive ? "shadow-hard" : "shadow-hard-sm"}`}
								key={preset.value}
								onClick={() => handleDatePreset(preset.value)}
								size="sm"
								variant={isActive ? "default" : "outline"}
							>
								{preset.label}
							</Button>
						);
					})}
					<Popover onOpenChange={setIsDateOpen} open={isDateOpen}>
						<PopoverTrigger asChild>
							<Button
								aria-label="Огноо сонгох"
								className={`h-9 w-9 p-0 ${isCustomDate ? "shadow-hard" : "shadow-hard-sm"}`}
								size="sm"
								variant={isCustomDate ? "default" : "outline"}
							>
								<CalendarIcon className="h-3.5 w-3.5" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="start" className="w-auto p-0">
							<Calendar
								components={{ DayButton: CalendarDayButton }}
								mode="single"
								onSelect={handleCustomDateSelect}
								selected={selectedDate}
							/>
						</PopoverContent>
					</Popover>
				</div>

				<div className="flex items-center gap-2 sm:ml-auto">
					<Select
						onValueChange={(value) => onFilterChange("paymentStatus", value)}
						value={paymentStatus ?? "all"}
					>
						<SelectTrigger className="shadow-hard-sm h-9 w-[150px] text-xs">
							<SelectValue placeholder="Төлбөр" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Бүх төлбөр</SelectItem>
							{paymentStatusConstants.map((status) => (
								<SelectItem key={status} value={status}>
									{paymentStatusLabel[status]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="bg-border h-6 w-px" />

					<Button
						className={`h-9 gap-1 px-3 text-xs ${
							sortField === "total" ? "shadow-hard" : "shadow-hard-sm"
						}`}
						onClick={() => onSort("total")}
						size="sm"
						variant={sortField === "total" ? "default" : "outline"}
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
						className={`h-9 gap-1 px-3 text-xs ${
							sortField === "createdAt" ? "shadow-hard" : "shadow-hard-sm"
						}`}
						onClick={() => onSort("createdAt")}
						size="sm"
						variant={sortField === "createdAt" ? "default" : "outline"}
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
							className="hidden h-9 gap-1.5 sm:flex"
							onClick={onResetFilters}
							size="sm"
							variant="ghost"
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

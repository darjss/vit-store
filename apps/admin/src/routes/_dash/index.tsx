import { createFileRoute } from "@tanstack/react-router";
import {
	Activity,
	AlertTriangle,
	ArrowDownRight,
	ArrowUpRight,
	BarChart3,
	CheckCircle,
	Clock,
	DollarSign,
	Eye,
	Package,
	ShoppingCart,
	TrendingUp,
	Truck,
	XCircle,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";

export const Route = createFileRoute("/_dash/")({
	component: HomeComponent,
});

// Mock data for demonstration
const mockData = {
	pendingOrders: 23,
	dailyRevenue: 2450000,
	weeklyRevenue: 17200000,
	monthlyRevenue: 68500000,
	dailyOrders: 45,
	weeklyOrders: 312,
	monthlyOrders: 1248,
	totalCustomers: 3847,
	totalProducts: 523,
	totalOrders: 8756,
	lowStockProducts: 12,
	abandonedCarts: 38,
	dailyVisits: 1247,
	weeklyVisits: 8234,
	monthlyVisits: 32847,
	revenueData: [
		{ date: "01/01", revenue: 4200000 },
		{ date: "01/02", revenue: 3800000 },
		{ date: "01/03", revenue: 5100000 },
		{ date: "01/04", revenue: 4600000 },
		{ date: "01/05", revenue: 6200000 },
		{ date: "01/06", revenue: 5800000 },
		{ date: "01/07", revenue: 7100000 },
	],
	recentOrders: [
		{
			id: 1,
			orderNumber: "ORD-2024-001",
			customerName: "Батбаяр",
			customerPhone: "99999999",
			status: "pending",
			total: 125000,
			createdAt: "2024-01-07T10:30:00Z",
		},
		{
			id: 2,
			orderNumber: "ORD-2024-002",
			customerName: "Сарангэрэл",
			customerPhone: "88888888",
			status: "shipped",
			total: 89000,
			createdAt: "2024-01-07T09:15:00Z",
		},
		{
			id: 3,
			orderNumber: "ORD-2024-003",
			customerName: "Төмөрбаатар",
			customerPhone: "77777777",
			status: "delivered",
			total: 234000,
			createdAt: "2024-01-07T08:45:00Z",
		},
		{
			id: 4,
			orderNumber: "ORD-2024-004",
			customerName: "Нарантуяа",
			customerPhone: "66666666",
			status: "pending",
			total: 156000,
			createdAt: "2024-01-07T07:20:00Z",
		},
	],
	topProducts: [
		{ name: "iPhone 15 Pro", sold: 24, revenue: 28800000 },
		{ name: "Samsung Galaxy S24", sold: 18, revenue: 12600000 },
		{ name: "AirPods Pro", sold: 32, revenue: 9600000 },
		{ name: "MacBook Air M2", sold: 8, revenue: 16000000 },
		{ name: "iPad Pro 12.9", sold: 12, revenue: 10800000 },
	],
	lowStockItems: [
		{ name: "iPhone 15 Pro Max", stock: 3, minStock: 10 },
		{ name: "Samsung Galaxy Watch", stock: 5, minStock: 15 },
		{ name: "AirPods Max", stock: 2, minStock: 8 },
	],
};

const StatCard = ({
	title,
	value,
	change,
	changeType,
	icon: Icon,
	period,
}: {
	title: string;
	value: string | number;
	change?: number;
	changeType?: "increase" | "decrease";
	icon: any;
	period?: string;
}) => (
	<Card className="border-2 shadow-md transition-all hover:translate-y-1 hover:shadow-none">
		<CardContent className="p-4">
			<div className="flex items-center justify-between">
				<div className="space-y-1">
					<p className="font-medium text-muted-foreground text-sm">{title}</p>
					<p className="font-bold text-2xl">{value}</p>
					{change !== undefined && (
						<div className="flex items-center gap-1 text-xs">
							{changeType === "increase" ? (
								<ArrowUpRight className="h-3 w-3 text-green-600" />
							) : (
								<ArrowDownRight className="h-3 w-3 text-red-600" />
							)}
							<span
								className={
									changeType === "increase" ? "text-green-600" : "text-red-600"
								}
							>
								{Math.abs(change)}%
							</span>
							<span className="text-muted-foreground">{period}</span>
						</div>
					)}
				</div>
				<div className="rounded-lg bg-muted/50 p-2">
					<Icon className="h-5 w-5 text-muted-foreground" />
				</div>
			</div>
		</CardContent>
	</Card>
);

const OrderStatusBadge = ({ status }: { status: string }) => {
	const getStatusConfig = (status: string) => {
		switch (status) {
			case "pending":
				return {
					label: "Хүлээгдэж буй",
					className: "bg-yellow-100 text-yellow-800 border-yellow-200",
					icon: Clock,
				};
			case "shipped":
				return {
					label: "Илгээгдсэн",
					className: "bg-blue-100 text-blue-800 border-blue-200",
					icon: Truck,
				};
			case "delivered":
				return {
					label: "Хүргэгдсэн",
					className: "bg-green-100 text-green-800 border-green-200",
					icon: CheckCircle,
				};
			case "cancelled":
				return {
					label: "Цуцлагдсан",
					className: "bg-red-100 text-red-800 border-red-200",
					icon: XCircle,
				};
			default:
				return {
					label: status,
					className: "bg-gray-100 text-gray-800 border-gray-200",
					icon: Clock,
				};
		}
	};

	const config = getStatusConfig(status);
	const Icon = config.icon;

	return (
		<Badge className={`flex items-center gap-1 ${config.className}`}>
			<Icon className="h-3 w-3" />
			{config.label}
		</Badge>
	);
};

function HomeComponent() {
	return (
		<div className="space-y-6 p-2 sm:p-6">
			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="font-bold text-2xl">Хяналтын самбар</h1>
					<p className="text-muted-foreground">
						Таны бизнесийн үйл ажиллагааны хураангуй
					</p>
				</div>
				<Button className="gap-2">
					<Activity className="h-4 w-4" />
					Шинэчлэх
				</Button>
			</div>

			{/* Pending Orders Overview */}
			<Card className="border-l-4 border-l-orange-500">
				<CardContent className="p-4">
					<div className="flex items-center justify-between">
						<div className="flex items-center gap-3">
							<div className="rounded-lg bg-orange-100 p-3">
								<ShoppingCart className="h-6 w-6 text-orange-600" />
							</div>
							<div>
								<h3 className="font-semibold">Хүлээгдэж буй захиалгууд</h3>
								<p className="font-bold text-2xl text-orange-600">
									{mockData.pendingOrders}
								</p>
							</div>
						</div>
						<div className="flex gap-2">
							<Button size="sm" variant="outline">
								Дэлгэрэнгүй
							</Button>
							<Button size="sm">Захиалгууд харах</Button>
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Revenue Stats */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatCard
					title="Өдрийн орлого"
					value={`₮${mockData.dailyRevenue.toLocaleString()}`}
					change={12.5}
					changeType="increase"
					icon={DollarSign}
					period="өчигдөрөөс"
				/>
				<StatCard
					title="7 хоногийн орлого"
					value={`₮${mockData.weeklyRevenue.toLocaleString()}`}
					change={8.2}
					changeType="increase"
					icon={BarChart3}
					period="өмнөх 7 хоноос"
				/>
				<StatCard
					title="Сарын орлого"
					value={`₮${mockData.monthlyRevenue.toLocaleString()}`}
					change={-3.1}
					changeType="decrease"
					icon={TrendingUp}
					period="өмнөх сараас"
				/>
			</div>

			{/* Order Count Stats */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatCard
					title="Өдрийн захиалга"
					value={mockData.dailyOrders}
					change={15.3}
					changeType="increase"
					icon={ShoppingCart}
					period="өчигдөрөөс"
				/>
				<StatCard
					title="7 хоногийн захиалга"
					value={mockData.weeklyOrders}
					change={6.7}
					changeType="increase"
					icon={Package}
					period="өмнөх 7 хоноос"
				/>
				<StatCard
					title="Сарын захиалга"
					value={mockData.monthlyOrders}
					change={2.1}
					changeType="increase"
					icon={Activity}
					period="өмнөх сараас"
				/>
			</div>

			{/* Sales Chart and Recent Orders */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Sales Chart */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<BarChart3 className="h-5 w-5" />
							Орлогын чиг хандлага
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ChartContainer
							config={{
								revenue: {
									label: "Орлого",
									color: "hsl(var(--chart-1))",
								},
							}}
							className="h-[300px]"
						>
							<ResponsiveContainer width="100%" height="100%">
								<LineChart data={mockData.revenueData}>
									<XAxis dataKey="date" />
									<YAxis />
									<ChartTooltip content={<ChartTooltipContent />} />
									<Line
										type="monotone"
										dataKey="revenue"
										stroke="hsl(var(--chart-1))"
										strokeWidth={2}
									/>
								</LineChart>
							</ResponsiveContainer>
						</ChartContainer>
					</CardContent>
				</Card>

				{/* Recent Orders */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Clock className="h-5 w-5" />
							Сүүлийн захиалгууд
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{mockData.recentOrders.map((order) => (
								<div
									key={order.id}
									className="flex items-center justify-between rounded-lg border p-3"
								>
									<div className="flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium">{order.orderNumber}</span>
											<OrderStatusBadge status={order.status} />
										</div>
										<div className="text-muted-foreground text-sm">
											{order.customerName} • {order.customerPhone}
										</div>
									</div>
									<div className="text-right">
										<div className="font-semibold">
											₮{order.total.toLocaleString()}
										</div>
										<div className="text-muted-foreground text-xs">
											{new Date(order.createdAt).toLocaleTimeString()}
										</div>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Top Products and Quick Stats */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
				{/* Top Selling Products */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<TrendingUp className="h-5 w-5" />
							Хамгийн их зарагдсан бүтээгдэхүүнүүд
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{mockData.topProducts.map((product, index) => (
								<div
									key={product.name}
									className="flex items-center justify-between"
								>
									<div className="flex items-center gap-3">
										<div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted font-semibold text-sm">
											{index + 1}
										</div>
										<div>
											<div className="font-medium">{product.name}</div>
											<div className="text-muted-foreground text-sm">
												{product.sold} ширхэг зарагдсан
											</div>
										</div>
									</div>
									<div className="text-right">
										<div className="font-semibold">
											₮{product.revenue.toLocaleString()}
										</div>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Quick Stats */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Activity className="h-5 w-5" />
							Хурдан статистик
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
							<div className="text-center">
								<div className="font-bold text-2xl text-blue-600">
									{mockData.totalCustomers.toLocaleString()}
								</div>
								<div className="text-muted-foreground text-sm">
									Нийт харилцагч
								</div>
							</div>
							<div className="text-center">
								<div className="font-bold text-2xl text-green-600">
									{mockData.totalProducts.toLocaleString()}
								</div>
								<div className="text-muted-foreground text-sm">
									Нийт бүтээгдэхүүн
								</div>
							</div>
							<div className="text-center">
								<div className="font-bold text-2xl text-purple-600">
									{mockData.totalOrders.toLocaleString()}
								</div>
								<div className="text-muted-foreground text-sm">
									Нийт захиалга
								</div>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Alerts and Analytics */}
			<div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
				{/* Low Stock Alerts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-orange-600">
							<AlertTriangle className="h-5 w-5" />
							Бага үлдэгдэлтэй бүтээгдэхүүнүүд
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-2">
							{mockData.lowStockItems.map((item) => (
								<div
									key={item.name}
									className="flex items-center justify-between rounded-lg border border-orange-200 bg-orange-50 p-2"
								>
									<div>
										<div className="font-medium text-sm">{item.name}</div>
										<div className="text-muted-foreground text-xs">
											Үлдэгдэл: {item.stock} / Хамгийн бага: {item.minStock}
										</div>
									</div>
									<Badge variant="outline" className="text-orange-600">
										{item.stock} үлдсэн
									</Badge>
								</div>
							))}
						</div>
					</CardContent>
				</Card>

				{/* Web Analytics */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Eye className="h-5 w-5" />
							Веб аналитик
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<span className="text-sm">Өдрийн зочин</span>
								<span className="font-semibold">
									{mockData.dailyVisits.toLocaleString()}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm">7 хоногийн зочин</span>
								<span className="font-semibold">
									{mockData.weeklyVisits.toLocaleString()}
								</span>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-sm">Сарын зочин</span>
								<span className="font-semibold">
									{mockData.monthlyVisits.toLocaleString()}
								</span>
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Abandoned Carts */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-red-600">
							<XCircle className="h-5 w-5" />
							Орхигдсон сагс
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="text-center">
							<div className="font-bold text-3xl text-red-600">
								{mockData.abandonedCarts}
							</div>
							<div className="text-muted-foreground text-sm">
								Өнөөдөр орхигдсон сагснууд
							</div>
							<Button size="sm" variant="outline" className="mt-3 w-full">
								Дэлгэрэнгүй харах
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

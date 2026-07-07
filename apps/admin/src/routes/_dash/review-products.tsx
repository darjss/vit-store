import { createFileRoute, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
	ArrowRight,
	Boxes,
	CheckCircle2,
	ExternalLink,
	PackagePlus,
	Tags,
	TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { productStatusLabel } from "@/lib/enum-labels";
import {
	addedProducts,
	priceChangedProducts,
	type AddedProduct,
	type PriceChangedProduct,
} from "@/features/products/vit-review-data";

export const Route = createFileRoute("/_dash/review-products")({
	component: RouteComponent,
});

const remainingWork = {
	priceMismatches: 5,
	extractedOnly: 26,
	possibleMatches: 60,
};

function RouteComponent() {
	const navigate = useNavigate();
	const totalOldPrice = priceChangedProducts.reduce(
		(total, product) => total + product.oldPrice,
		0,
	);
	const totalNewPrice = priceChangedProducts.reduce(
		(total, product) => total + product.newPrice,
		0,
	);

	const viewProduct = (id: number) => {
		navigate({ to: "/products/$id", params: { id: String(id) } });
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-3 border-2 border-border bg-card p-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="mb-1 font-black text-muted-foreground text-xs uppercase tracking-[0.16em]">
						VIT импортын хяналт
					</p>
					<h1 className="font-heading text-2xl font-black">
						Хянах бүтээгдэхүүнүүд
					</h1>
					<p className="max-w-2xl text-muted-foreground text-sm">
						Шинээр ноорог болгож нэмсэн бүтээгдэхүүн болон үнэ өөрчилсөн
						бүтээгдэхүүнийг хоёр баганаар харуулж байна.
					</p>
				</div>
				<div className="grid grid-cols-3 border-2 border-border text-center text-xs">
					<MetricCell label="Нэмсэн" value={addedProducts.length} />
					<MetricCell label="Үнэ" value={priceChangedProducts.length} />
					<MetricCell
						label="Зөрүү"
						value={formatMoney(totalNewPrice - totalOldPrice)}
					/>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<StatusPanel
					icon={<CheckCircle2 className="h-4 w-4" />}
					label="Оруулсан ноорог"
					value={`${addedProducts.length} бүтээгдэхүүн`}
					tone="primary"
				/>
				<StatusPanel
					icon={<TrendingUp className="h-4 w-4" />}
					label="Үнэ шинэчилсэн"
					value={`${priceChangedProducts.length} бүтээгдэхүүн`}
				/>
				<StatusPanel
					icon={<Boxes className="h-4 w-4" />}
					label="Үлдсэн хяналт"
					value={`${remainingWork.priceMismatches} үнэ, ${remainingWork.extractedOnly} нэмэлт`}
				/>
			</div>

			<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
				<ReviewColumn
					title="Нэмсэн ноорог"
					count={addedProducts.length}
					icon={<PackagePlus className="h-4 w-4" />}
				>
					{addedProducts.map((product) => (
						<AddedProductRow
							key={product.id}
							product={product}
							onView={() => viewProduct(product.id)}
						/>
					))}
				</ReviewColumn>

				<ReviewColumn
					title="Үнэ өөрчилсөн"
					count={priceChangedProducts.length}
					icon={<Tags className="h-4 w-4" />}
				>
					{priceChangedProducts.map((product) => (
						<PriceChangedRow
							key={product.id}
							product={product}
							onView={() => viewProduct(product.id)}
						/>
					))}
				</ReviewColumn>
			</div>
		</div>
	);
}

function MetricCell({
	label,
	value,
}: {
	label: string;
	value: number | string;
}) {
	return (
		<div className="min-w-24 border-border border-r-2 p-2 last:border-r-0">
			<div className="font-black text-lg tabular-nums">{value}</div>
			<div className="font-bold text-muted-foreground uppercase tracking-wide">
				{label}
			</div>
		</div>
	);
}

function StatusPanel({
	icon,
	label,
	value,
	tone = "plain",
}: {
	icon: ReactNode;
	label: string;
	value: string;
	tone?: "plain" | "primary";
}) {
	return (
		<div
			className={
				tone === "primary"
					? "flex items-center gap-3 border-2 border-border bg-primary p-3"
					: "flex items-center gap-3 border-2 border-border bg-card p-3"
			}
		>
			<div className="flex h-9 w-9 items-center justify-center border-2 border-border bg-background">
				{icon}
			</div>
			<div className="min-w-0">
				<div className="font-black text-sm">{value}</div>
				<div className="font-bold text-muted-foreground text-xs uppercase tracking-wide">
					{label}
				</div>
			</div>
		</div>
	);
}

function ReviewColumn({
	title,
	count,
	icon,
	children,
}: {
	title: string;
	count: number;
	icon: ReactNode;
	children: ReactNode;
}) {
	return (
		<Card className="rounded-none border-2 border-border shadow-none">
			<CardHeader className="border-border border-b-2 p-3">
				<CardTitle className="flex items-center justify-between gap-3 text-base">
					<span className="flex min-w-0 items-center gap-2">
						<span className="flex h-8 w-8 shrink-0 items-center justify-center border-2 border-border bg-primary">
							{icon}
						</span>
						<span className="truncate font-black">{title}</span>
					</span>
					<span className="shrink-0 border-2 border-border bg-background px-2 py-1 font-black text-xs tabular-nums">
						{count}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="max-h-[72vh] overflow-auto p-0">
				<div className="divide-y-2 divide-border">{children}</div>
			</CardContent>
		</Card>
	);
}

function AddedProductRow({
	product,
	onView,
}: {
	product: AddedProduct;
	onView: () => void;
}) {
	return (
		<div className="grid grid-cols-[88px_1fr] gap-3 bg-card p-3">
			<ProductThumb src={product.imageUrl} alt={product.name} />
			<div className="grid min-w-0 gap-2">
				<RowTopline
					id={product.id}
					status={product.status}
					score={product.confidence}
					onView={onView}
				/>
				<div>
					<div className="font-black text-sm leading-snug">{product.name}</div>
					<div className="mt-1 flex flex-wrap gap-1.5 text-muted-foreground text-xs">
						<span>{product.brandName}</span>
						{product.amount && <span>хэмжээ: {product.amount}</span>}
						{product.potency && product.potency !== "N/A" && (
							<span>хүч: {product.potency}</span>
						)}
					</div>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="font-black text-lg tabular-nums">
						{formatMoney(product.price)}
					</div>
					<div className="truncate text-muted-foreground text-xs">
						{product.source ?? "эх сурвалж алга"}
					</div>
				</div>
			</div>
		</div>
	);
}

function PriceChangedRow({
	product,
	onView,
}: {
	product: PriceChangedProduct;
	onView: () => void;
}) {
	const delta = product.newPrice - product.oldPrice;

	return (
		<div className="grid grid-cols-[88px_1fr] gap-3 bg-card p-3">
			<ProductThumb src={product.imageUrl} alt={product.name} />
			<div className="grid min-w-0 gap-2">
				<RowTopline
					id={product.id}
					status={product.status}
					score={product.score}
					onView={onView}
				/>
				<div>
					<div className="font-black text-sm leading-snug">{product.name}</div>
					<div className="mt-1 text-muted-foreground text-xs">
						{product.brandName}
					</div>
				</div>
				<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
					<PriceBox label="Өмнө" value={product.oldPrice} />
					<ArrowRight className="h-4 w-4 text-muted-foreground" />
					<PriceBox label="Одоо" value={product.newPrice} emphatic />
				</div>
				<div className="flex items-center justify-between gap-3 text-xs">
					<span className="font-black text-emerald-700">
						+{formatMoney(delta)}
					</span>
					<span className="truncate text-muted-foreground">
						{product.sourceImage ?? "эх зураг алга"}
					</span>
				</div>
			</div>
		</div>
	);
}

function ProductThumb({ src, alt }: { src: string | null; alt: string }) {
	return (
		<div className="flex h-[88px] w-[88px] items-center justify-center overflow-hidden border-2 border-border bg-background">
			{src ? (
				<img
					src={src}
					alt={alt}
					className="h-full w-full object-contain"
					loading="lazy"
				/>
			) : (
				<PackagePlus className="h-7 w-7 text-muted-foreground" />
			)}
		</div>
	);
}

function RowTopline({
	id,
	status,
	score,
	onView,
}: {
	id: number;
	status: string;
	score: number | null;
	onView: () => void;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="border-2 border-border bg-background px-1.5 py-0.5 font-black text-[10px] uppercase">
					#{id}
				</span>
				<span className="border-2 border-border bg-muted px-1.5 py-0.5 font-black text-[10px] uppercase">
					{productStatusLabel[status as keyof typeof productStatusLabel] ??
						status}
				</span>
				{score !== null && (
					<span className="border-2 border-border bg-background px-1.5 py-0.5 font-black text-[10px] uppercase">
						{Math.round(score * 100)}%
					</span>
				)}
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={onView}
				className="h-8 shrink-0 px-2 text-xs"
			>
				<ExternalLink className="mr-1 h-3 w-3" />
				Нээх
			</Button>
		</div>
	);
}

function PriceBox({
	label,
	value,
	emphatic = false,
}: {
	label: string;
	value: number;
	emphatic?: boolean;
}) {
	return (
		<div
			className={
				emphatic
					? "border-2 border-border bg-primary p-2"
					: "border-2 border-border bg-background p-2"
			}
		>
			<div className="font-bold text-[10px] text-muted-foreground uppercase tracking-wide">
				{label}
			</div>
			<div className="font-black text-sm tabular-nums">
				{formatMoney(value)}
			</div>
		</div>
	);
}

function formatMoney(value: number): string {
	return `${value.toLocaleString("en-US")}₮`;
}

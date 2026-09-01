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
import { labelForProductStatus } from "@/lib/product-status-display";
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
	extractedOnly: 26,
	possibleMatches: 60,
	priceMismatches: 5,
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
		navigate({ params: { id: String(id) }, to: "/products/$id" });
	};

	return (
		<div className="space-y-4">
			<div className="border-border bg-card flex flex-col gap-3 border-2 p-4 md:flex-row md:items-end md:justify-between">
				<div>
					<p className="text-muted-foreground mb-1 text-xs font-black tracking-[0.16em] uppercase">
						VIT импортын хяналт
					</p>
					<h1 className="font-heading text-2xl font-black">Хянах бүтээгдэхүүнүүд</h1>
					<p className="text-muted-foreground max-w-2xl text-sm">
						Шинээр ноорог болгож нэмсэн бүтээгдэхүүн болон үнэ өөрчилсөн бүтээгдэхүүнийг хоёр
						баганаар харуулж байна.
					</p>
				</div>
				<div className="border-border grid grid-cols-3 border-2 text-center text-xs">
					<MetricCell label="Нэмсэн" value={addedProducts.length} />
					<MetricCell label="Үнэ" value={priceChangedProducts.length} />
					<MetricCell label="Зөрүү" value={formatMoney(totalNewPrice - totalOldPrice)} />
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
				<StatusPanel
					icon={<CheckCircle2 className="h-4 w-4" />}
					label="Оруулсан ноорог"
					tone="primary"
					value={`${addedProducts.length} бүтээгдэхүүн`}
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
					count={addedProducts.length}
					icon={<PackagePlus className="h-4 w-4" />}
					title="Нэмсэн ноорог"
				>
					{addedProducts.map((product) => (
						<AddedProductRow
							key={product.id}
							onView={() => viewProduct(product.id)}
							product={product}
						/>
					))}
				</ReviewColumn>

				<ReviewColumn
					count={priceChangedProducts.length}
					icon={<Tags className="h-4 w-4" />}
					title="Үнэ өөрчилсөн"
				>
					{priceChangedProducts.map((product) => (
						<PriceChangedRow
							key={product.id}
							onView={() => viewProduct(product.id)}
							product={product}
						/>
					))}
				</ReviewColumn>
			</div>
		</div>
	);
}

function MetricCell({ label, value }: { label: string; value: number | string }) {
	return (
		<div className="border-border min-w-24 border-r-2 p-2 last:border-r-0">
			<div className="text-lg font-black tabular-nums">{value}</div>
			<div className="text-muted-foreground font-bold tracking-wide uppercase">{label}</div>
		</div>
	);
}

function StatusPanel({
	icon,
	label,
	tone = "plain",
	value,
}: {
	icon: ReactNode;
	label: string;
	tone?: "plain" | "primary";
	value: string;
}) {
	return (
		<div
			className={
				tone === "primary"
					? "border-border bg-primary flex items-center gap-3 border-2 p-3"
					: "border-border bg-card flex items-center gap-3 border-2 p-3"
			}
		>
			<div className="border-border bg-background flex h-9 w-9 items-center justify-center border-2">
				{icon}
			</div>
			<div className="min-w-0">
				<div className="text-sm font-black">{value}</div>
				<div className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
					{label}
				</div>
			</div>
		</div>
	);
}

function ReviewColumn({
	children,
	count,
	icon,
	title,
}: {
	children: ReactNode;
	count: number;
	icon: ReactNode;
	title: string;
}) {
	return (
		<Card className="border-border rounded-none border-2 shadow-none">
			<CardHeader className="border-border border-b-2 p-3">
				<CardTitle className="flex items-center justify-between gap-3 text-base">
					<span className="flex min-w-0 items-center gap-2">
						<span className="border-border bg-primary flex h-8 w-8 shrink-0 items-center justify-center border-2">
							{icon}
						</span>
						<span className="truncate font-black">{title}</span>
					</span>
					<span className="border-border bg-background shrink-0 border-2 px-2 py-1 text-xs font-black tabular-nums">
						{count}
					</span>
				</CardTitle>
			</CardHeader>
			<CardContent className="max-h-[72vh] overflow-auto p-0">
				<div className="divide-border divide-y-2">{children}</div>
			</CardContent>
		</Card>
	);
}

function AddedProductRow({ onView, product }: { onView: () => void; product: AddedProduct }) {
	return (
		<div className="bg-card grid grid-cols-[88px_1fr] gap-3 p-3">
			<ProductThumb alt={product.name} src={product.imageUrl} />
			<div className="grid min-w-0 gap-2">
				<RowTopline
					id={product.id}
					onView={onView}
					score={product.confidence}
					status={product.status}
				/>
				<div>
					<div className="text-sm leading-snug font-black">{product.name}</div>
					<div className="text-muted-foreground mt-1 flex flex-wrap gap-1.5 text-xs">
						<span>{product.brandName}</span>
						{product.amount && <span>хэмжээ: {product.amount}</span>}
						{product.potency && product.potency !== "N/A" && <span>хүч: {product.potency}</span>}
					</div>
				</div>
				<div className="flex items-center justify-between gap-3">
					<div className="text-lg font-black tabular-nums">{formatMoney(product.price)}</div>
					<div className="text-muted-foreground truncate text-xs">
						{product.source ?? "эх сурвалж алга"}
					</div>
				</div>
			</div>
		</div>
	);
}

function PriceChangedRow({
	onView,
	product,
}: {
	onView: () => void;
	product: PriceChangedProduct;
}) {
	const delta = product.newPrice - product.oldPrice;

	return (
		<div className="bg-card grid grid-cols-[88px_1fr] gap-3 p-3">
			<ProductThumb alt={product.name} src={product.imageUrl} />
			<div className="grid min-w-0 gap-2">
				<RowTopline id={product.id} onView={onView} score={product.score} status={product.status} />
				<div>
					<div className="text-sm leading-snug font-black">{product.name}</div>
					<div className="text-muted-foreground mt-1 text-xs">{product.brandName}</div>
				</div>
				<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
					<PriceBox label="Өмнө" value={product.oldPrice} />
					<ArrowRight className="text-muted-foreground h-4 w-4" />
					<PriceBox emphatic label="Одоо" value={product.newPrice} />
				</div>
				<div className="flex items-center justify-between gap-3 text-xs">
					<span className="font-black text-emerald-700">+{formatMoney(delta)}</span>
					<span className="text-muted-foreground truncate">
						{product.sourceImage ?? "эх зураг алга"}
					</span>
				</div>
			</div>
		</div>
	);
}

function ProductThumb({ alt, src }: { alt: string; src: string | null }) {
	return (
		<div className="border-border bg-background flex h-[88px] w-[88px] items-center justify-center overflow-hidden border-2">
			{src ? (
				<img alt={alt} className="h-full w-full object-contain" loading="lazy" src={src} />
			) : (
				<PackagePlus className="text-muted-foreground h-7 w-7" />
			)}
		</div>
	);
}

function RowTopline({
	id,
	onView,
	score,
	status,
}: {
	id: number;
	onView: () => void;
	score: number | null;
	status: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="border-border bg-background border-2 px-1.5 py-0.5 text-[10px] font-black uppercase">
					#{id}
				</span>
				<span className="border-border bg-muted border-2 px-1.5 py-0.5 text-[10px] font-black uppercase">
					{labelForProductStatus(status)}
				</span>
				{score !== null && (
					<span className="border-border bg-background border-2 px-1.5 py-0.5 text-[10px] font-black uppercase">
						{Math.round(score * 100)}%
					</span>
				)}
			</div>
			<Button className="h-8 shrink-0 px-2 text-xs" onClick={onView} size="sm" variant="ghost">
				<ExternalLink className="mr-1 h-3 w-3" />
				Нээх
			</Button>
		</div>
	);
}

function PriceBox({
	emphatic = false,
	label,
	value,
}: {
	emphatic?: boolean;
	label: string;
	value: number;
}) {
	return (
		<div
			className={
				emphatic
					? "border-border bg-primary border-2 p-2"
					: "border-border bg-background border-2 p-2"
			}
		>
			<div className="text-muted-foreground text-[10px] font-bold tracking-wide uppercase">
				{label}
			</div>
			<div className="text-sm font-black tabular-nums">{formatMoney(value)}</div>
		</div>
	);
}

function formatMoney(value: number): string {
	return `${value.toLocaleString("en-US")}₮`;
}

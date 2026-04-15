import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronLeft,
	ChevronRight,
	Database,
	Download,
	ImageIcon,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import rebuiltProductsJsonRaw from "../../../../../vit/.vit-ai/reports/products.final.rebuilt.json";
import manualDecisionsRaw from "../../../../../vit/.vit-ai/reports/rebuilt/manual-review-decisions.json";
import reportJsonRaw from "../../../../../vit/.vit-ai/reports/rebuilt/products-vs-db.resolved.report.json";

const imageModules = import.meta.glob(
	"../../../../../vit/*.{jpg,jpeg,png,webp}",
	{
		eager: true,
		import: "default",
	},
);

const imageUrlByName = Object.fromEntries(
	Object.entries(imageModules).map(([modulePath, assetUrl]) => [
		modulePath.split("/").pop() ?? modulePath,
		assetUrl as string,
	]),
);

type ExtractedProduct = {
	brandName: string;
	productName: string;
	price: number | null;
	priceText: string | null;
	variant: string | null;
	sizeOrCount: string | null;
	sourceImages: string[];
	aliases: string[];
	confidence: number;
	canonicalKey: string;
};

type DbProduct = {
	id: number;
	name: string;
	slug: string;
	price: number;
	amount: string;
	potency: string;
	status: string;
	stock: number;
	brandName: string;
	categoryName: string;
};

type MatchRecord = {
	matchType: string;
	score: number;
	scoreBreakdown: {
		brandScore: number;
		nameScore: number;
		detailScore: number;
		priceScore: number;
	};
	extracted: ExtractedProduct;
	db: DbProduct;
	priceDelta: number | null;
};

type DiffReport = {
	generatedAt: string;
	extractedCount: number;
	dbCount: number;
	strongMatches: MatchRecord[];
	possibleMatches: MatchRecord[];
	extractedOnly: ExtractedProduct[];
	dbOnly: DbProduct[];
	priceMismatches: MatchRecord[];
	reviewedDifferent?: ReviewItem[];
};

const rebuiltProductsJson = rebuiltProductsJsonRaw as ExtractedProduct[];
const reportJson = reportJsonRaw as unknown as DiffReport;
const manualDecisions = manualDecisionsRaw as Record<string, ReviewDecision>;
type ReviewFilter =
	| "possible"
	| "extractedOnly"
	| "dbOnly"
	| "priceMismatches"
	| "different"
	| "strong";
type ReviewDecision = "same" | "different" | "needs-review";

type ReviewItem =
	| {
			id: string;
			kind: "possible" | "strong" | "priceMismatches";
			label: string;
			searchText: string;
			match: MatchRecord;
	  }
	| {
			id: string;
			kind: "extractedOnly";
			label: string;
			searchText: string;
			extracted: ExtractedProduct;
	  }
	| {
			id: string;
			kind: "dbOnly";
			label: string;
			searchText: string;
			db: DbProduct;
	  };

const reviewBuckets: Record<ReviewFilter, ReviewItem[]> = {
	possible: reportJson.possibleMatches.map((match) => ({
		id: `possible-${match.db.id}-${match.extracted.canonicalKey}`,
		kind: "possible",
		label: `${match.extracted.brandName} ${match.extracted.productName}`,
		searchText: [
			match.extracted.brandName,
			match.extracted.productName,
			match.extracted.variant,
			match.extracted.sizeOrCount,
			match.db.brandName,
			match.db.name,
			match.db.amount,
			match.db.potency,
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase(),
		match,
	})),
	extractedOnly: reportJson.extractedOnly.map((extracted) => ({
		id: `extracted-${extracted.canonicalKey}`,
		kind: "extractedOnly",
		label: `${extracted.brandName} ${extracted.productName}`,
		searchText: [
			extracted.brandName,
			extracted.productName,
			extracted.variant,
			extracted.sizeOrCount,
			...(extracted.sourceImages ?? []),
		]
			.filter(Boolean)
			.join(" ")
			.toLowerCase(),
		extracted,
	})),
	dbOnly: reportJson.dbOnly.map((db) => ({
		id: `db-${db.id}`,
		kind: "dbOnly",
		label: `${db.brandName} ${db.name}`,
		searchText: [db.brandName, db.name, db.amount, db.potency, db.slug]
			.filter(Boolean)
			.join(" ")
			.toLowerCase(),
		db,
	})),
	priceMismatches: reportJson.priceMismatches.map((match) => ({
		id: `price-${match.db.id}-${match.extracted.canonicalKey}`,
		kind: "priceMismatches",
		label: `${match.extracted.brandName} ${match.extracted.productName}`,
		searchText: [
			match.extracted.brandName,
			match.extracted.productName,
			match.db.brandName,
			match.db.name,
		]
			.join(" ")
			.toLowerCase(),
		match,
	})),
	different: (reportJson.reviewedDifferent ?? []).map((item) =>
		item.kind === "dbOnly"
			? {
					id: item.id,
					kind: "dbOnly",
					label: `${item.db.brandName} ${item.db.name}`,
					searchText: [
						item.db.brandName,
						item.db.name,
						item.db.amount,
						item.db.potency,
						item.db.slug,
					]
						.filter(Boolean)
						.join(" ")
						.toLowerCase(),
					db: item.db,
				}
			: item.kind === "extractedOnly"
				? {
						id: item.id,
						kind: "extractedOnly",
						label: `${item.extracted.brandName} ${item.extracted.productName}`,
						searchText: [
							item.extracted.brandName,
							item.extracted.productName,
							item.extracted.variant,
							item.extracted.sizeOrCount,
							...(item.extracted.sourceImages ?? []),
						]
							.filter(Boolean)
							.join(" ")
							.toLowerCase(),
						extracted: item.extracted,
					}
				: {
						id: item.id,
						kind: item.kind,
						label: `${item.match.extracted.brandName} ${item.match.extracted.productName}`,
						searchText: [
							item.match.extracted.brandName,
							item.match.extracted.productName,
							item.match.extracted.variant,
							item.match.extracted.sizeOrCount,
							item.match.db.brandName,
							item.match.db.name,
							item.match.db.amount,
							item.match.db.potency,
						]
							.filter(Boolean)
							.join(" ")
							.toLowerCase(),
						match: item.match,
					},
	),
	strong: reportJson.strongMatches.map((match) => ({
		id: `strong-${match.db.id}-${match.extracted.canonicalKey}`,
		kind: "strong",
		label: `${match.extracted.brandName} ${match.extracted.productName}`,
		searchText: [
			match.extracted.brandName,
			match.extracted.productName,
			match.db.brandName,
			match.db.name,
		]
			.join(" ")
			.toLowerCase(),
		match,
	})),
};

const filterMeta: Array<{
	key: ReviewFilter;
	label: string;
	tone: string;
}> = [
	{
		key: "possible",
		label: "Possible",
		tone: "bg-amber-200 text-amber-950 border-amber-950",
	},
	{
		key: "extractedOnly",
		label: "Extracted Only",
		tone: "bg-sky-200 text-sky-950 border-sky-950",
	},
	{
		key: "dbOnly",
		label: "DB Only",
		tone: "bg-slate-200 text-slate-950 border-slate-950",
	},
	{
		key: "priceMismatches",
		label: "Price Mismatch",
		tone: "bg-rose-200 text-rose-950 border-rose-950",
	},
	{
		key: "different",
		label: "Different",
		tone: "bg-zinc-200 text-zinc-950 border-zinc-950",
	},
	{
		key: "strong",
		label: "Strong Match",
		tone: "bg-emerald-200 text-emerald-950 border-emerald-950",
	},
];

export const Route = createFileRoute("/_dash/review-products")({
	component: RouteComponent,
});

function RouteComponent() {
	const [activeFilter, setActiveFilter] = useState<ReviewFilter>("possible");
	const [query, setQuery] = useState("");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [decisions, setDecisions] = useState<Record<string, ReviewDecision>>(
		{},
	);

	useEffect(() => {
		const base = { ...manualDecisions };
		const saved = window.localStorage.getItem("vit-review-decisions");
		if (!saved) {
			setDecisions(base);
			return;
		}

		try {
			setDecisions({
				...base,
				...(JSON.parse(saved) as Record<string, ReviewDecision>),
			});
		} catch {
			window.localStorage.removeItem("vit-review-decisions");
			setDecisions(base);
		}
	}, []);

	useEffect(() => {
		window.localStorage.setItem(
			"vit-review-decisions",
			JSON.stringify(decisions, null, 2),
		);
	}, [decisions]);

	const visibleBuckets = useMemo(
		() =>
			({
				possible: reviewBuckets.possible.filter((item) => !decisions[item.id]),
				extractedOnly: reviewBuckets.extractedOnly.filter(
					(item) => !decisions[item.id],
				),
				dbOnly: reviewBuckets.dbOnly.filter((item) => !decisions[item.id]),
				priceMismatches: reviewBuckets.priceMismatches.filter(
					(item) => !decisions[item.id],
				),
				different: reviewBuckets.different,
				strong: reviewBuckets.strong,
			}) satisfies Record<ReviewFilter, ReviewItem[]>,
		[decisions],
	);

	const filteredItems = useMemo(() => {
		const bucket = visibleBuckets[activeFilter];
		if (!query.trim()) return bucket;
		const lowered = query.trim().toLowerCase();
		return bucket.filter((item) => item.searchText.includes(lowered));
	}, [activeFilter, query, visibleBuckets]);

	const selectedItem = filteredItems[selectedIndex] ?? filteredItems[0] ?? null;
	const extractedCoverage = Math.round(
		((reportJson.strongMatches.length + reportJson.possibleMatches.length) /
			reportJson.extractedCount) *
			100,
	);

	return (
		<div className="space-y-6">
			<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
				<SummaryCard
					title="Extracted"
					value={reportJson.extractedCount.toString()}
					footnote={`${rebuiltProductsJson.length} rebuilt rows`}
				/>
				<SummaryCard
					title="DB Products"
					value={reportJson.dbCount.toString()}
					footnote={`${reportJson.dbOnly.length} unmatched in DB view`}
				/>
				<SummaryCard
					title="Coverage"
					value={`${extractedCoverage}%`}
					footnote={`${reportJson.strongMatches.length} strong, ${visibleBuckets.possible.length} possible left`}
				/>
				<SummaryCard
					title="Review Queue"
					value={(
						visibleBuckets.possible.length + visibleBuckets.extractedOnly.length
					).toString()}
					footnote="remaining unlabeled possible + extracted-only"
				/>
			</section>

			<Card className="border-border/80 bg-white/90">
				<CardHeader className="gap-4 border-border/60 border-b pb-4">
					<div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
						<div className="space-y-2">
							<CardTitle className="text-2xl">
								Product Review Workspace
							</CardTitle>
							<p className="max-w-3xl text-muted-foreground text-sm">
								Review extracted products against the current DB catalog.
								Potency, count, and package size are treated as distinct product
								identity fields in the rebuilt dataset.
							</p>
						</div>
						<div className="relative w-full max-w-md">
							<Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-muted-foreground" />
							<Input
								value={query}
								onChange={(event) => {
									setQuery(event.target.value);
									setSelectedIndex(0);
								}}
								placeholder="Search extracted, DB, count, potency..."
								className="pl-10"
							/>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						{filterMeta.map((item) => (
							<button
								type="button"
								key={item.key}
								onClick={() => {
									setActiveFilter(item.key);
									setSelectedIndex(0);
								}}
								className={[
									"rounded-none border-2 px-3 py-2 font-bold font-heading text-sm shadow-hard transition-all",
									activeFilter === item.key
										? item.tone
										: "border-border bg-background text-foreground hover:translate-y-1 hover:shadow-none",
								].join(" ")}
							>
								{item.label}{" "}
								<span className="opacity-70">
									{visibleBuckets[item.key].length}
								</span>
							</button>
						))}
						<Button
							variant="outline"
							size="sm"
							className="ml-auto"
							onClick={() => {
								const blob = new Blob([JSON.stringify(decisions, null, 2)], {
									type: "application/json",
								});
								const url = URL.createObjectURL(blob);
								const anchor = document.createElement("a");
								anchor.href = url;
								anchor.download = "review-decisions.json";
								anchor.click();
								URL.revokeObjectURL(url);
							}}
						>
							<Download className="size-4" />
							Export decisions
						</Button>
					</div>
				</CardHeader>
				<CardContent className="grid gap-4 pt-6 xl:grid-cols-[360px_minmax(0,1fr)]">
					<div className="space-y-3">
						<div className="flex items-center justify-between">
							<Badge variant="outline" className="bg-background">
								{filteredItems.length} visible
							</Badge>
							<Badge variant="outline" className="bg-background">
								{Object.keys(decisions).length} labeled
							</Badge>
							<div className="flex items-center gap-2">
								<Button
									size="icon"
									variant="outline"
									disabled={selectedIndex <= 0}
									onClick={() =>
										setSelectedIndex((current) => Math.max(0, current - 1))
									}
								>
									<ChevronLeft className="size-4" />
								</Button>
								<Button
									size="icon"
									variant="outline"
									disabled={selectedIndex >= filteredItems.length - 1}
									onClick={() =>
										setSelectedIndex((current) =>
											Math.min(filteredItems.length - 1, current + 1),
										)
									}
								>
									<ChevronRight className="size-4" />
								</Button>
							</div>
						</div>

						<div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
							{filteredItems.map((item, index) => (
								<button
									type="button"
									key={item.id}
									onClick={() => setSelectedIndex(index)}
									className={[
										"w-full rounded-none border-2 p-3 text-left transition-all",
										selectedIndex === index
											? "border-foreground bg-primary text-primary-foreground shadow-hard"
											: "border-border bg-background hover:translate-y-1 hover:shadow-none",
									].join(" ")}
								>
									<div className="mb-2 flex items-start justify-between gap-2">
										<p className="line-clamp-2 font-bold font-heading text-sm">
											{item.label}
										</p>
										<div className="flex items-center gap-2">
											{decisions[item.id] ? (
												<DecisionBadge decision={decisions[item.id]} />
											) : null}
											<ItemKindBadge kind={item.kind} />
										</div>
									</div>
									<p
										className={[
											"line-clamp-2 text-xs",
											selectedIndex === index
												? "text-primary-foreground/80"
												: "text-muted-foreground",
										].join(" ")}
									>
										{getSubtitle(item)}
									</p>
								</button>
							))}
						</div>
					</div>

					<div>
						{selectedItem ? (
							<ReviewDetail
								item={selectedItem}
								decision={decisions[selectedItem.id]}
								onSetDecision={(decision) => {
									setDecisions((current) => ({
										...current,
										[selectedItem.id]: decision,
									}));
								}}
								onClearDecision={() => {
									setDecisions((current) => {
										const next = { ...current };
										delete next[selectedItem.id];
										return next;
									});
								}}
							/>
						) : (
							<Card>
								<CardContent className="py-12 text-center text-muted-foreground">
									No items match the current search.
								</CardContent>
							</Card>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

function ReviewDetail({
	item,
	decision,
	onSetDecision,
	onClearDecision,
}: {
	item: ReviewItem;
	decision?: ReviewDecision;
	onSetDecision: (decision: ReviewDecision) => void;
	onClearDecision: () => void;
}) {
	if (item.kind === "dbOnly") {
		return (
			<div className="space-y-4">
				<SectionHeader
					title="DB Only Product"
					description="Present in the database but not found in the rebuilt extracted set."
				/>
				<DecisionToolbar
					decision={decision}
					onSetDecision={onSetDecision}
					onClearDecision={onClearDecision}
				/>
				<DbCard db={item.db} />
			</div>
		);
	}

	if (item.kind === "extractedOnly") {
		return (
			<div className="space-y-4">
				<SectionHeader
					title="Extracted Only Product"
					description="Found in images but currently unmatched in the DB catalog."
				/>
				<DecisionToolbar
					decision={decision}
					onSetDecision={onSetDecision}
					onClearDecision={onClearDecision}
				/>
				<ExtractedCard extracted={item.extracted} />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<SectionHeader
				title={
					item.kind === "priceMismatches"
						? "Price Mismatch Review"
						: "Match Review"
				}
				description="Compare extracted catalog evidence against the best current DB candidate."
			/>
			<DecisionToolbar
				decision={decision}
				onSetDecision={onSetDecision}
				onClearDecision={onClearDecision}
			/>
			<div className="grid gap-4 xl:grid-cols-2">
				<ExtractedCard extracted={item.match.extracted} />
				<DbCard db={item.match.db} match={item.match} />
			</div>
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-lg">
						<Database className="size-5" />
						Similarity Signals
					</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3 md:grid-cols-4">
					<MetricBadge label="Overall" value={item.match.score.toFixed(3)} />
					<MetricBadge
						label="Brand"
						value={item.match.scoreBreakdown.brandScore.toFixed(3)}
					/>
					<MetricBadge
						label="Name"
						value={item.match.scoreBreakdown.nameScore.toFixed(3)}
					/>
					<MetricBadge
						label="Detail"
						value={item.match.scoreBreakdown.detailScore.toFixed(3)}
					/>
				</CardContent>
			</Card>
		</div>
	);
}

function DecisionToolbar({
	decision,
	onSetDecision,
	onClearDecision,
}: {
	decision?: ReviewDecision;
	onSetDecision: (decision: ReviewDecision) => void;
	onClearDecision: () => void;
}) {
	return (
		<Card className="bg-white">
			<CardContent className="flex flex-wrap items-center gap-3 pt-6">
				<Button
					variant={decision === "same" ? "default" : "outline"}
					onClick={() => onSetDecision("same")}
				>
					Same
				</Button>
				<Button
					variant={decision === "different" ? "destructive" : "outline"}
					onClick={() => onSetDecision("different")}
				>
					Different
				</Button>
				<Button
					variant={decision === "needs-review" ? "secondary" : "outline"}
					onClick={() => onSetDecision("needs-review")}
				>
					Needs review
				</Button>
				<Button variant="ghost" onClick={onClearDecision}>
					Clear
				</Button>
				{decision ? <DecisionBadge decision={decision} /> : null}
			</CardContent>
		</Card>
	);
}

function ExtractedCard({ extracted }: { extracted: ExtractedProduct }) {
	const imageUrls = (extracted.sourceImages ?? [])
		.map((name) => ({
			name,
			url: imageUrlByName[name],
		}))
		.filter((item): item is { name: string; url: string } => Boolean(item.url));

	return (
		<Card className="bg-white">
			<CardHeader className="gap-2">
				<CardTitle className="text-xl">Extracted Shelf Evidence</CardTitle>
				<p className="text-muted-foreground text-sm">
					Use this image as the ground truth.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="space-y-2">
					<p className="font-bold font-heading text-sm">Source Shelf Image</p>
					{imageUrls.length > 0 ? (
						<div className="space-y-3">
							{imageUrls[0] ? (
								<div className="space-y-2">
									<div className="overflow-hidden border-2 border-border bg-stone-100">
										<img
											src={imageUrls[0].url}
											alt={imageUrls[0].name}
											className="max-h-[520px] w-full object-contain"
										/>
									</div>
									<p className="break-all text-muted-foreground text-xs">
										{imageUrls[0].name}
									</p>
								</div>
							) : null}
							{imageUrls.length > 1 ? (
								<div className="grid gap-3 sm:grid-cols-2">
									{imageUrls.slice(1).map((image) => (
										<div key={image.name} className="space-y-2">
											<div className="overflow-hidden border-2 border-border bg-stone-100">
												<img
													src={image.url}
													alt={image.name}
													className="aspect-square w-full object-cover"
												/>
											</div>
											<p className="break-all text-muted-foreground text-xs">
												{image.name}
											</p>
										</div>
									))}
								</div>
							) : null}
							<div className="rounded-none border-2 border-amber-950 bg-amber-100 p-3 text-amber-950 text-sm">
								Use this shelf image as the ground truth when the imported DB
								title or brand looks wrong.
							</div>
						</div>
					) : (
						<div className="flex items-center gap-2 border-2 border-border border-dashed p-4 text-muted-foreground text-sm">
							<ImageIcon className="size-4" />
							No preview imported for these image files.
						</div>
					)}
				</div>
				<div className="grid gap-3 sm:grid-cols-2">
					<InfoBlock label="Brand" value={extracted.brandName} />
					<InfoBlock
						label="Price"
						value={
							extracted.price ? formatCurrency(extracted.price) : "No price"
						}
					/>
					<InfoBlock label="Name" value={extracted.productName} />
					<InfoBlock
						label="Variant / Size"
						value={[extracted.variant, extracted.sizeOrCount]
							.filter(Boolean)
							.join(" | ")}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

function DbCard({ db, match }: { db: DbProduct; match?: MatchRecord }) {
	return (
		<Card className="bg-stone-50/80">
			<CardHeader className="gap-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<CardTitle className="text-xl">{db.name}</CardTitle>
						<p className="mt-1 text-muted-foreground text-sm">{db.brandName}</p>
					</div>
					<div className="flex flex-col items-end gap-2">
						<Badge variant="solid">{formatCurrency(db.price)}</Badge>
						<Badge variant="outline">{db.status}</Badge>
					</div>
				</div>
				{match ? (
					<div className="flex flex-wrap gap-2">
						<Badge variant="outline">db id {db.id}</Badge>
						<Badge variant="outline">
							price delta{" "}
							{match.priceDelta !== null
								? formatCurrency(match.priceDelta)
								: "unknown"}
						</Badge>
					</div>
				) : null}
			</CardHeader>
			<CardContent className="grid gap-3 sm:grid-cols-2">
				<InfoBlock label="Amount" value={db.amount} />
				<InfoBlock label="Potency" value={db.potency} />
				<InfoBlock label="Category" value={db.categoryName} />
				<InfoBlock label="Stock" value={String(db.stock)} />
				<InfoBlock label="Slug" value={db.slug} mono />
				<InfoBlock label="ID" value={String(db.id)} mono />
			</CardContent>
		</Card>
	);
}

function SummaryCard({
	title,
	value,
	footnote,
}: {
	title: string;
	value: string;
	footnote: string;
}) {
	return (
		<Card className="bg-white/90">
			<CardHeader className="pb-2">
				<p className="font-bold font-heading text-muted-foreground text-sm uppercase tracking-wide">
					{title}
				</p>
				<CardTitle className="text-4xl">{value}</CardTitle>
			</CardHeader>
			<CardContent>
				<p className="text-muted-foreground text-sm">{footnote}</p>
			</CardContent>
		</Card>
	);
}

function SectionHeader({
	title,
	description,
}: {
	title: string;
	description: string;
}) {
	return (
		<div className="space-y-1">
			<h1 className="font-bold font-heading text-2xl">{title}</h1>
			<p className="text-muted-foreground text-sm">{description}</p>
		</div>
	);
}

function InfoBlock({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div className="border-2 border-border/70 bg-background p-3">
			<p className="mb-1 font-bold font-heading text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</p>
			<p className={mono ? "break-all font-mono text-sm" : "text-sm"}>
				{value || "—"}
			</p>
		</div>
	);
}

function MetricBadge({ label, value }: { label: string; value: string }) {
	return (
		<div className="border-2 border-border bg-background p-3">
			<p className="font-bold font-heading text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</p>
			<p className="mt-1 text-2xl">{value}</p>
		</div>
	);
}

function ItemKindBadge({ kind }: { kind: ReviewItem["kind"] }) {
	const styles: Record<ReviewItem["kind"], string> = {
		possible: "bg-amber-200 text-amber-950 border-amber-950",
		extractedOnly: "bg-sky-200 text-sky-950 border-sky-950",
		dbOnly: "bg-slate-200 text-slate-950 border-slate-950",
		priceMismatches: "bg-rose-200 text-rose-950 border-rose-950",
		strong: "bg-emerald-200 text-emerald-950 border-emerald-950",
	};

	return (
		<Badge variant="outline" className={styles[kind]}>
			{kind}
		</Badge>
	);
}

function DecisionBadge({ decision }: { decision: ReviewDecision }) {
	const styles: Record<ReviewDecision, string> = {
		same: "bg-emerald-200 text-emerald-950 border-emerald-950",
		different: "bg-rose-200 text-rose-950 border-rose-950",
		"needs-review": "bg-amber-200 text-amber-950 border-amber-950",
	};

	return (
		<Badge variant="outline" className={styles[decision]}>
			{decision}
		</Badge>
	);
}

function getSubtitle(item: ReviewItem): string {
	if (item.kind === "dbOnly") {
		return `${item.db.amount} | ${item.db.potency}`;
	}

	if (item.kind === "extractedOnly") {
		return [item.extracted.variant, item.extracted.sizeOrCount]
			.filter(Boolean)
			.join(" | ");
	}

	return `${item.match.db.brandName} | score ${item.match.score.toFixed(3)}`;
}

import { Skeleton } from "@/components/ui/skeleton";

function PageChrome({ title = true, actions = true }: { title?: boolean; actions?: boolean }) {
	return (
		<div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div className="space-y-2">
				{title && <Skeleton className="h-8 w-48" />}
				<Skeleton className="h-4 w-72 max-w-full" />
			</div>
			{actions && <Skeleton className="h-10 w-32" />}
		</div>
	);
}

function FilterRail({ count = 4 }: { count?: number }) {
	return (
		<div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
			{Array.from({ length: count }).map((_, index) => (
				<Skeleton key={index} className="h-11" />
			))}
		</div>
	);
}

function CardGrid({ count = 8 }: { count?: number }) {
	return (
		<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
			{Array.from({ length: count }).map((_, index) => (
				<div key={index} className="border-2 border-border bg-card p-4 shadow-hard-sm">
					<div className="mb-4 flex items-start gap-3">
						<Skeleton className="h-14 w-14" />
						<div className="flex-1 space-y-2">
							<Skeleton className="h-5 w-3/4" />
							<Skeleton className="h-4 w-1/2" />
						</div>
					</div>
					<div className="space-y-2">
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-5/6" />
					</div>
				</div>
			))}
		</div>
	);
}

function TableList({ count = 6 }: { count?: number }) {
	return (
		<div className="space-y-3">
			{Array.from({ length: count }).map((_, index) => (
				<div key={index} className="border-2 border-border bg-card p-4 shadow-hard-sm">
					<div className="flex items-center justify-between gap-4">
						<div className="flex flex-1 items-center gap-3">
							<Skeleton className="h-12 w-12" />
							<div className="flex-1 space-y-2">
								<Skeleton className="h-5 w-2/3" />
								<Skeleton className="h-4 w-1/3" />
							</div>
						</div>
						<Skeleton className="h-8 w-24" />
					</div>
				</div>
			))}
		</div>
	);
}

export function DashboardPageSkeleton() {
	return <div className="space-y-4"><div className="grid grid-cols-2 gap-2"><Skeleton className="h-20" /><Skeleton className="h-20" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><TableList count={3} /></div>;
}

export function AnalyticsPageSkeleton() {
	return <div className="space-y-5"><PageChrome actions={false} /><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div><TableList count={4} /></div>;
}

export function OrdersPageSkeleton() {
	return <div className="space-y-4"><PageChrome /><FilterRail count={5} /><TableList count={8} /></div>;
}

export function SimpleCardsPageSkeleton() {
	return <div className="space-y-4"><PageChrome /><CardGrid count={10} /></div>;
}

export function CustomersPageSkeleton() {
	return <div className="space-y-4"><PageChrome /><FilterRail count={3} /><CardGrid count={9} /></div>;
}

export function PurchasesPageSkeleton() {
	return <div className="space-y-4"><PageChrome /><FilterRail count={4} /><TableList count={7} /></div>;
}

export function FormPageSkeleton() {
	return <div className="mx-auto max-w-4xl space-y-5"><PageChrome actions={false} /><Skeleton className="h-72" /><Skeleton className="h-56" /></div>;
}

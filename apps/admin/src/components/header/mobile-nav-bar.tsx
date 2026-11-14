import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { navGroups } from "@/lib/constants";
import { useNavCounts } from "@/lib/nav-counts";
import { cn } from "@/lib/utils";
import UserData from "./user-data";

const tabClass =
	"relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium";

const MobileNavbar = () => {
	const counts = useNavCounts();
	const [menuOpen, setMenuOpen] = useState(false);
	const [daily, ...rest] = navGroups;

	return (
		<nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-white pb-[env(safe-area-inset-bottom,0px)]">
			<ul className="grid grid-cols-5">
				{daily.items.map((item) => {
					const count = "count" in item ? counts[item.count] : undefined;
					return (
						<li key={item.url}>
							<Link activeOptions={{ exact: item.url === "/" }} className={tabClass} to={item.url}>
								{({ isActive }) => (
									<>
										{isActive && (
											<span aria-hidden className="bg-foreground absolute top-0 h-0.5 w-8" />
										)}
										<item.icon
											className={cn(
												"size-5",
												isActive ? "text-foreground" : "text-muted-foreground",
											)}
										/>
										<span
											className={
												isActive ? "text-foreground font-semibold" : "text-muted-foreground"
											}
										>
											{item.title}
										</span>
										{count ? (
											<span className="bg-primary absolute top-1.5 left-1/2 ml-1.5 min-w-5 px-1 text-center text-[11px] leading-5 font-semibold tabular-nums">
												{count}
											</span>
										) : null}
									</>
								)}
							</Link>
						</li>
					);
				})}
				<li>
					<Sheet onOpenChange={setMenuOpen} open={menuOpen}>
						<SheetTrigger className={cn(tabClass, "text-muted-foreground w-full")}>
							<Menu className="size-5" />
							<span>Цэс</span>
						</SheetTrigger>
						<SheetContent
							className="gap-0 border-t p-0 pb-[env(safe-area-inset-bottom,0px)]"
							side="bottom"
						>
							<SheetTitle className="sr-only">Цэс</SheetTitle>
							{rest.map((group) => (
								<div className="border-b px-2 py-2" key={group.title}>
									<p className="text-muted-foreground px-3 pb-1 text-[11px] font-medium tracking-wide uppercase">
										{group.title}
									</p>
									{group.items.map((item) => (
										<Link
											className="flex h-11 items-center gap-3 px-3 text-[15px]"
											key={item.url}
											onClick={() => setMenuOpen(false)}
											to={item.url}
										>
											<item.icon className="text-muted-foreground size-5" />
											{item.title}
										</Link>
									))}
								</div>
							))}
							<div className="px-2 py-2">
								<UserData />
							</div>
						</SheetContent>
					</Sheet>
				</li>
			</ul>
		</nav>
	);
};

export default MobileNavbar;

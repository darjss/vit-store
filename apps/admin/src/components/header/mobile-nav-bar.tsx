import { sideNavItems } from "@/lib/constants";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils"; // optional: className merge helper if you have one

const MobileNavbar = () => {
	const navItems = sideNavItems.slice(0, 4);

	return (
		<nav className="sticky inset-x-0 bottom-0 z-40 border-border border-t bg-background">
			<div className="mx-auto max-w-screen-sm">
				<ul className="grid grid-cols-4 gap-1 px-3 py-2">
					{navItems.map((nav) => (
						<li key={nav.url}>
							<Link
								to={nav.url}
								activeProps={{
									className:
										"text-foreground bg-main/60 shadow-[var(--shadow)] ring-1 ring-ring",
								}}
								className={cn(
									"group block rounded-[var(--radius-base)]",
									"px-3 py-2",
									"transition-colors duration-200",
									"text-foreground/70 hover:text-foreground",
									"hover:bg-main/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
							>
								<div className="flex flex-col items-center gap-1">
									<nav.icon
										className={cn(
											"h-5 w-5",
											"transition-transform duration-200",
											"group-hover:scale-110",
										)}
									/>
									<p className="font-medium text-[11px] leading-none">
										{nav.title}
									</p>
								</div>
							</Link>
						</li>
					))}
				</ul>
			</div>
		</nav>
	);
};

export default MobileNavbar;

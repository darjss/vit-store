import { Link } from "@tanstack/react-router";
import { sideNavItems } from "@/lib/constants";
import { cn } from "@/lib/utils";

const MobileNavbar = () => {
	const navItems = sideNavItems.slice(0, 4);

	return (
		<nav className="border-border bg-background fixed inset-x-0 bottom-0 z-40 border-t-2 pb-[env(safe-area-inset-bottom,0px)]">
			<div className="mx-auto max-w-screen-sm">
				<ul className="grid grid-cols-4 gap-2 px-4 py-3">
					{navItems.map((nav) => (
						<li key={nav.url}>
							<Link
								activeProps={{
									className: "bg-primary text-primary-foreground shadow-hard-sm translate-y-[2px]",
								}}
								className={cn(
									"group block rounded-none border-2 border-transparent",
									"px-1 py-2",
									"transition-all duration-200",
									"text-foreground hover:bg-muted",
									"focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
								)}
								to={nav.url}
							>
								<div className="flex flex-col items-center gap-1.5">
									<nav.icon
										className={cn(
											"h-5 w-5",
											"transition-transform duration-200",
											"group-hover:-rotate-12 group-active:scale-95",
										)}
									/>
									<p className="font-heading text-[10px] leading-none font-bold tracking-wide uppercase">
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

import { Link } from "@tanstack/react-router";
import { sideNavItems } from "@/lib/constants";
import { cn } from "@/lib/utils";

const MobileNavbar = () => {
	const navItems = sideNavItems.slice(0, 4);

	return (
		<nav className="sticky inset-x-0 bottom-0 z-40 border-border border-t-2 bg-background pb-safe">
			<div className="mx-auto max-w-screen-sm">
				<ul className="grid grid-cols-4 gap-2 px-4 py-3">
					{navItems.map((nav) => (
						<li key={nav.url}>
							<Link
								to={nav.url}
								activeProps={{
									className:
										"bg-primary text-primary-foreground shadow-hard-sm translate-y-[2px]",
								}}
								className={cn(
									"group block rounded-none border-2 border-transparent",
									"px-1 py-2",
									"transition-all duration-200",
									"text-foreground hover:bg-muted",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								)}
							>
								<div className="flex flex-col items-center gap-1.5">
									<nav.icon
										className={cn(
											"h-5 w-5",
											"transition-transform duration-200",
											"group-hover:-rotate-12 group-active:scale-95",
										)}
									/>
									<p className="font-bold font-heading text-[10px] uppercase leading-none tracking-wide">
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

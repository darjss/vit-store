import { Link } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { sideNavItems } from "@/lib/constants";
import { cn } from "@/lib/utils";

const AppSidebar = () => {
	return (
		<Sidebar className="border-border border-r-2" collapsible="offcanvas">
			<SidebarContent>
				<SidebarGroup className="p-3">
					<SidebarGroupContent>
						<SidebarMenu className="gap-2 pt-2">
							{sideNavItems.map((item) => (
								<SidebarMenuItem className="relative" key={item.title}>
									<Link
										activeProps={{
											className: "is-active",
										}}
										className={cn(
											"rounded-base block transition-colors",
											"focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-hidden",
										)}
										to={item.url}
									>
										{({ isActive }) => (
											<div className="relative">
												<span
													aria-hidden
													className={cn(
														"absolute top-1/2 left-0 h-6 w-1 -translate-y-1/2 rounded-full transition-all",
														isActive ? "bg-primary opacity-100" : "bg-transparent opacity-0",
													)}
												/>
												<SidebarMenuButton
													className={cn(
														"rounded-base px-3 py-2",
														"transition-colors duration-150",
														"hover:bg-primary hover:text-primary-foreground",
														isActive
															? [
																	"bg-primary text-primary-foreground",
																	"shadow-[var(--shadow-shadow)]",
																	"font-heading",
																	"pl-4",
																	"outline-border",
																].join(" ")
															: "text-foreground",
													)}
													isActive={isActive}
												>
													<item.icon
														className={cn(
															"size-5 transition-colors",
															isActive ? "text-primary-foreground" : "text-foreground",
														)}
													/>
													<span
														className={cn(
															"truncate text-sm md:text-base",
															isActive ? "text-primary-foreground" : "text-foreground",
														)}
													>
														{item.title}
													</span>
												</SidebarMenuButton>
											</div>
										)}
									</Link>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
		</Sidebar>
	);
};

export default AppSidebar;

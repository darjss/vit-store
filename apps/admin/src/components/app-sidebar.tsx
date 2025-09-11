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
		<Sidebar collapsible="offcanvas" className="border-border border-r-2">
			<SidebarContent>
				<SidebarGroup className="p-3">
					<SidebarGroupContent>
						<SidebarMenu className="gap-2 pt-2">
							{sideNavItems.map((item) => (
								<SidebarMenuItem key={item.title} className="relative">
									<Link
										to={item.url}
										activeProps={{
											className: "is-active",
										}}
										className={cn(
											"block rounded-base transition-colors",
											"focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
										)}
									>
										{({ isActive }) => (
											<div className="relative">
												<span
													aria-hidden
													className={cn(
														"-translate-y-1/2 absolute top-1/2 left-0 h-6 w-1 rounded-full transition-all",
														isActive
															? "bg-primary opacity-100"
															: "bg-transparent opacity-0",
													)}
												/>
												<SidebarMenuButton
													isActive={isActive}
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
												>
													<item.icon
														className={cn(
															"size-5 transition-colors",
															isActive
																? "text-primary-foreground"
																: "text-foreground",
														)}
													/>
													<span
														className={cn(
															"truncate text-sm md:text-base",
															isActive
																? "text-primary-foreground"
																: "text-foreground",
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

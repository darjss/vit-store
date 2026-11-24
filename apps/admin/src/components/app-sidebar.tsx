import { Link } from "@tanstack/react-router";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { navGroups } from "@/lib/constants";
import { useNavCounts } from "@/lib/nav-counts";
import { cn } from "@/lib/utils";
import UserData from "./header/user-data";

const AppSidebar = () => {
	const counts = useNavCounts();
	return (
		<Sidebar className="border-r bg-white" collapsible="offcanvas">
			<SidebarHeader className="flex-row items-center gap-2 px-4 pt-4 pb-2">
				<img alt="" aria-hidden="true" className="size-6 shrink-0" src="/favicon.svg" />
				<span className="text-sm font-bold tracking-tight">Amerik Vitamin</span>
			</SidebarHeader>
			<SidebarContent className="gap-0">
				{navGroups.map((group, index) => (
					<SidebarGroup className="px-2 py-1.5" key={index}>
						{"title" in group && (
							<SidebarGroupLabel className="text-muted-foreground h-6 px-2 text-[11px] font-medium tracking-wide uppercase">
								{group.title}
							</SidebarGroupLabel>
						)}
						<SidebarMenu className="gap-0.5">
							{group.items.map((item) => {
								const count = "count" in item ? counts[item.count] : undefined;
								return (
									<SidebarMenuItem key={item.url}>
										<Link
											activeOptions={{ exact: item.url === "/" }}
											className="text-foreground/80 hover:bg-muted flex h-8 items-center gap-2.5 px-2 text-sm"
											to={item.url}
										>
											{({ isActive }) => (
												<>
													<item.icon
														className={cn(
															"size-4",
															isActive ? "text-foreground" : "text-muted-foreground",
														)}
													/>
													<span
														className={cn(
															"flex-1 truncate",
															isActive && "text-foreground font-semibold",
														)}
													>
														{item.title}
													</span>
													{count ? (
														<span className="bg-primary min-w-5 px-1.5 text-center text-xs font-semibold tabular-nums">
															{count}
														</span>
													) : null}
													{isActive && (
														<span aria-hidden className="bg-foreground -mr-2 h-5 w-0.5" />
													)}
												</>
											)}
										</Link>
									</SidebarMenuItem>
								);
							})}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter className="border-t p-2">
				<UserData />
			</SidebarFooter>
		</Sidebar>
	);
};

export default AppSidebar;

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
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const AppSidebar = () => {
  return (
    <Sidebar collapsible="offcanvas" className="border-r-2 border-border">
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
                      "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    )}
                  >
                    {({ isActive }) => (
                      <div className="relative">
                        <span
                          aria-hidden
                          className={cn(
                            "absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-full transition-all",
                            isActive
                              ? "bg-main opacity-100"
                              : "bg-transparent opacity-0"
                          )}
                        />
                        <SidebarMenuButton
                          isActive={isActive}
                          className={cn(
                            "rounded-base px-3 py-2",
                            "transition-colors duration-150",
                            "hover:bg-main hover:text-main-foreground",
                            isActive
                              ? [
                                  "bg-main text-main-foreground",
                                  "shadow-[var(--shadow-shadow)]",
                                  "font-heading",
                                  "pl-4",
                                  "outline-border",
                                ].join(" ")
                              : "text-foreground"
                          )}
                        >
                          <item.icon
                            className={cn(
                              "size-5 transition-colors",
                              isActive
                                ? "text-main-foreground"
                                : "text-foreground"
                            )}
                          />
                          <span
                            className={cn(
                              "text-sm md:text-base truncate",
                              isActive
                                ? "text-main-foreground"
                                : "text-foreground"
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

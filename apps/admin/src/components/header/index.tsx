import { Search, UserRound } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";
import BreadCrumbs from "./breadcrumb";
import SearchBar from "./search-bar";
import UserData from "./user-data";

const Header = () => {
	return (
		<header className="sticky top-0 z-40 w-full border-border border-b-4 bg-transparent shadow-shadow">
			<div className="flex h-16 items-center justify-between px-3 sm:px-4">
				<div className="flex items-center gap-2 sm:gap-3">
					<SidebarTrigger
						aria-label="Open sidebar"
						className="hover:-translate-x-0.5 hover:-translate-y-0.5 rounded-base border-2 border-border bg-background text-foreground/70 shadow-shadow ring-offset-background transition-transform hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-x-0 active:translate-y-0"
					/>

					<div className="select-none">
						<BreadCrumbs />
					</div>
				</div>

				<div className="hidden min-w-0 flex-1 px-4 md:block">
					<div className="mx-auto w-full max-w-xl">
						<SearchBar />
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Popover>
						<PopoverTrigger asChild className="md:hidden">
							<Button
								aria-label="Search"
								variant="secondary"
								size="icon"
								className="hover:-translate-x-0.5 hover:-translate-y-0.5 rounded-base border-2 border-border bg-background text-foreground shadow-shadow ring-offset-background transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-x-0 active:translate-y-0"
							>
								<Search className="h-6 w-6" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="w-screen max-w-sm rounded-base border-2 border-border bg-background p-3 text-foreground shadow-shadow sm:p-4"
							sideOffset={8}
						>
							<h4 className="mb-3 font-medium text-base">Search</h4>
							<SearchBar autoFocus />
						</PopoverContent>
					</Popover>

					<Popover>
						<PopoverTrigger asChild>
							<Button
								aria-label="Open user menu"
								className="hover:-translate-x-0.5 hover:-translate-y-0.5 flex h-12 w-12 items-center justify-center rounded-base border-2 border-border bg-background shadow-shadow ring-offset-background transition-transform focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-x-0 active:translate-y-0"
							>
								<UserRound className="h-7 w-7 text-foreground" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="w-64 rounded-base border-2 border-border bg-background p-2 text-foreground shadow-shadow"
							sideOffset={8}
						>
							<UserData />
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</header>
	);
};

export default Header;

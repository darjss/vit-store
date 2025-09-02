import { Search, UserRound } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";
import SearchBar from "./search-bar";
import UserData from "./user-data";
import BreadCrumbs from "./breadcrumb";

const Header = () => {
	return (
		<header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="flex h-16 items-center justify-between px-3 sm:px-4">
				<div className="flex items-center gap-2 sm:gap-3">
					<SidebarTrigger
						aria-label="Open sidebar"
						className="text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-gray-100"
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
								variant="neutral"
								size="icon"
								className="rounded-full"
							>
								<Search className="h-5 w-5" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="w-screen max-w-sm p-3 sm:p-4"
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
								className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary-background transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
							>
								<UserRound className="h-5 w-5 text-gray-700 dark:text-gray-200" />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end" className="w-64 p-2" sideOffset={8}>
							<UserData />
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</header>
	);
};

export default Header;

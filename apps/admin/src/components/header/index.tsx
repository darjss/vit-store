import { Link } from "@tanstack/react-router";
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

const Header = () => {
	return (
		<header className="sticky flex h-16 w-full border-b shadow-sm">
			<div className="sticky flex h-full w-full items-center justify-between px-4">
				<div className="flex items-center gap-2 md:gap-4">
					<SidebarTrigger className="text-gray-500 hover:text-gray-700" />
					<Link to="/">
						<h1 className="font-semibold text-gray-900 text-lg md:text-xl">
							Home
						</h1>
					</Link>
					<Link to="/orders">
						<h1 className="font-semibold text-gray-900 text-lg md:text-xl">
							Orders
						</h1>
					</Link>
					<Link to="/products">
						<h1 className="font-semibold text-gray-900 text-lg md:text-xl">
							Products
						</h1>
					</Link>
				</div>

				<div className="hidden w-96 md:block">
					<SearchBar />
				</div>

				<div className="flex items-center gap-2">
					
					<Popover>
						<PopoverTrigger asChild className="md:hidden">
							<Button
								aria-label="Search"
								className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
							>
								<Search className="h-5 w-5 text-gray-600" />
							</Button>
						</PopoverTrigger>
						<PopoverContent className="w-screen max-w-sm p-4">
							<h4 className="mb-4 font-medium text-lg">Search Orders</h4>
							<SearchBar />
						</PopoverContent>
					</Popover>

					<Popover>
						<PopoverTrigger>
							<div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
								<UserRound className="h-5 w-5 text-gray-600" />
							</div>
						</PopoverTrigger>
						<PopoverContent className="w-56">
							<p>fpwrjiet</p>
							<UserData />
						</PopoverContent>
					</Popover>
				</div>
			</div>
		</header>
	);
};

export default Header;

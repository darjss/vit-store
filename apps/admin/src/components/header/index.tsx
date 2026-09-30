import { useNavigate } from "@tanstack/react-router";
import { Search, UserRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "../ui/button";
import { SidebarTrigger } from "../ui/sidebar";
import BreadCrumbs from "./breadcrumb";
import SearchBar from "./search-bar";
import UserData from "./user-data";

const Header = () => {
	const navigate = useNavigate();

	const handleSelectProduct = (productId: number) => {
		navigate({
			params: { id: String(productId) },
			to: "/products/$id",
		});
	};

	const handleSelectOrder = (orderId: number) => {
		navigate({
			params: { id: String(orderId) },
			to: "/orders/$id",
		});
	};

	return (
		<header className="border-border shadow-shadow sticky top-0 z-40 w-full border-b-4 bg-transparent">
			<div className="flex h-16 items-center justify-between px-3 sm:px-4">
				<div className="flex items-center gap-2 sm:gap-3">
					<SidebarTrigger
						aria-label="Хажуугийн цэс нээх"
						className="rounded-base border-border bg-background text-foreground/70 shadow-shadow ring-offset-background hover:text-foreground focus-visible:ring-ring border-2 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-x-0 active:translate-y-0"
					/>

					<div className="select-none">
						<BreadCrumbs />
					</div>
				</div>

				<div className="hidden min-w-0 flex-1 px-4 md:block">
					<div className="mx-auto w-full max-w-xl">
						<SearchBar
							onSelectOrder={handleSelectOrder}
							onSelectProduct={handleSelectProduct}
							placeholder="Бүтээгдэхүүн, захиалга хайх..."
						/>
					</div>
				</div>

				<div className="flex items-center gap-2">
					<Popover>
						<PopoverTrigger asChild className="md:hidden">
							<Button
								aria-label="Хайх"
								className="rounded-base border-border bg-background text-foreground shadow-shadow ring-offset-background focus-visible:ring-ring border-2 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-x-0 active:translate-y-0"
								size="icon"
								variant="secondary"
							>
								<Search className="h-6 w-6" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="rounded-base border-border bg-background text-foreground shadow-shadow w-screen max-w-sm border-2 p-3 sm:p-4"
							sideOffset={8}
						>
							<h4 className="mb-3 text-base font-medium">Хайх</h4>
							<SearchBar
								autoFocus
								onSelectOrder={handleSelectOrder}
								onSelectProduct={handleSelectProduct}
								placeholder="Бүтээгдэхүүн, захиалга хайх..."
							/>
						</PopoverContent>
					</Popover>

					<Popover>
						<PopoverTrigger asChild>
							<Button
								aria-label="Хэрэглэгчийн цэс нээх"
								className="rounded-base border-border bg-background shadow-shadow ring-offset-background focus-visible:ring-ring flex h-12 w-12 items-center justify-center border-2 transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-x-0 active:translate-y-0"
							>
								<UserRound className="text-foreground h-7 w-7" />
							</Button>
						</PopoverTrigger>
						<PopoverContent
							align="end"
							className="rounded-base border-border bg-background text-foreground shadow-shadow w-64 border-2 p-2"
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

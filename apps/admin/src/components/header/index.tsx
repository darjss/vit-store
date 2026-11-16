import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { labelForBreadcrumb } from "@/lib/constants";
import { SidebarTrigger } from "../ui/sidebar";
import SearchBar from "./search-bar";

const Header = () => {
	const navigate = useNavigate();
	const pathname = useLocation({ select: (location) => location.pathname });
	const [section, detail] = pathname.split("/").filter(Boolean);
	const title = section ? (labelForBreadcrumb(section) ?? section) : "Өнөөдөр";
	// Record pages like /orders/150 show their own number, so the header only needs the way back.
	const detailLabel = detail === undefined ? undefined : labelForBreadcrumb(detail);

	const handleSelectProduct = (productId: number) => {
		navigate({ params: { id: String(productId) }, to: "/products/$id" });
	};

	const handleSelectOrder = (orderId: number) => {
		navigate({ params: { id: String(orderId) }, to: "/orders/$id" });
	};

	return (
		<header className="sticky top-0 z-40 w-full border-b bg-white">
			<div className="flex h-12 items-center gap-2 px-3 md:px-4">
				<SidebarTrigger
					aria-label="Хажуугийн цэс"
					className="text-muted-foreground hover:bg-muted -ml-1 hidden size-8 border-0 bg-transparent shadow-none md:flex"
				/>
				{detail === undefined ? (
					<h1 className="flex-1 truncate text-base font-semibold">{title}</h1>
				) : (
					<div className="flex min-w-0 flex-1 items-center gap-1">
						<Link
							className="text-muted-foreground hover:text-foreground -ml-1 flex h-9 items-center pr-1 text-[15px]"
							to={`/${section}`}
						>
							<ChevronLeft className="size-5" />
							{title}
						</Link>
						{detailLabel ? (
							<>
								<span className="text-muted-foreground">/</span>
								<h1 className="truncate text-[15px] font-semibold">{detailLabel}</h1>
							</>
						) : null}
					</div>
				)}

				<div className="hidden w-80 md:block">
					<SearchBar
						onSelectOrder={handleSelectOrder}
						onSelectProduct={handleSelectProduct}
						placeholder="Бараа, захиалга, утас хайх"
					/>
				</div>

				<Popover>
					<PopoverTrigger asChild className="md:hidden">
						<button
							aria-label="Хайх"
							className="text-foreground -mr-2 flex size-10 items-center justify-center"
							type="button"
						>
							<Search className="size-5" />
						</button>
					</PopoverTrigger>
					<PopoverContent align="end" className="w-screen max-w-sm border p-2" sideOffset={6}>
						<SearchBar
							autoFocus
							onSelectOrder={handleSelectOrder}
							onSelectProduct={handleSelectProduct}
							placeholder="Бараа, захиалга, утас хайх"
						/>
					</PopoverContent>
				</Popover>
			</div>
		</header>
	);
};

export default Header;

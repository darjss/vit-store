import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useBreadcrumb } from "@/hooks/use-breadcrumb";

const BreadCrumbs = () => {
	const { breadcrumb_routes } = useBreadcrumb();
	return (
		<div className="flex w-full items-center gap-2 p-2 px-4">
			<Breadcrumb>
				<BreadcrumbList className="gap-1">
					<BreadcrumbItem>
						<Link
							to="/"
							className="flex items-center gap-2 font-bold text-foreground text-lg transition-colors duration-200 hover:text-primary"
						>
							<Home className="h-5 w-5" />
							<span className="hidden sm:inline">Нүүр</span>
						</Link>
					</BreadcrumbItem>

					{breadcrumb_routes.length > 0 && (
						<BreadcrumbSeparator className="font-bold text-foreground text-lg" />
					)}

					{breadcrumb_routes.map((crumb, index) => {
						const isLast = index === breadcrumb_routes.length - 1;

						const formattedName = crumb.name
							.replace(/-/g, " ")
							.replace(/\b\w/g, (l) => l.toUpperCase());

						if (isLast) {
							return (
								<BreadcrumbItem key={crumb.path}>
									<BreadcrumbPage className="font-bold text-foreground text-lg">
										{formattedName}
									</BreadcrumbPage>
								</BreadcrumbItem>
							);
						}

						return (
							<div className="flex items-center gap-2" key={crumb.path}>
								<BreadcrumbItem>
									<Link
										to={crumb.path}
										className="font-bold text-lg text-muted-foreground transition-colors duration-200 hover:text-foreground"
									>
										{formattedName}
									</Link>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="font-bold text-foreground text-lg" />
							</div>
						);
					})}
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
};
export default BreadCrumbs;

import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { labelForBreadcrumb } from "@/lib/constants";
import { useBreadcrumb } from "@/hooks/use-breadcrumb";

const BreadCrumbs = () => {
	const { breadcrumb_routes } = useBreadcrumb();
	return (
		<div className="flex w-full items-center gap-2 p-2 px-4">
			<Breadcrumb>
				<BreadcrumbList className="gap-1">
					<BreadcrumbItem>
						<Link
							className="text-foreground hover:text-primary flex items-center gap-2 text-lg font-bold transition-colors duration-200"
							to="/"
						>
							<Home className="h-5 w-5" />
							<span className="hidden sm:inline">Нүүр</span>
						</Link>
					</BreadcrumbItem>

					{breadcrumb_routes.length > 0 && (
						<BreadcrumbSeparator className="text-foreground text-lg font-bold" />
					)}

					{breadcrumb_routes.map((crumb, index) => {
						const isLast = index === breadcrumb_routes.length - 1;

						const formattedName =
							labelForBreadcrumb(crumb.name) ??
							crumb.name.replaceAll("-", " ").replaceAll(/\b\w/g, (l) => l.toUpperCase());

						if (isLast) {
							return (
								<BreadcrumbItem key={crumb.path}>
									<BreadcrumbPage className="text-foreground text-lg font-bold">
										{formattedName}
									</BreadcrumbPage>
								</BreadcrumbItem>
							);
						}

						return (
							<div className="flex items-center gap-2" key={crumb.path}>
								<BreadcrumbItem>
									<Link
										className="text-muted-foreground hover:text-foreground text-lg font-bold transition-colors duration-200"
										to={crumb.path}
									>
										{formattedName}
									</Link>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="text-foreground text-lg font-bold" />
							</div>
						);
					})}
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
};
export default BreadCrumbs;

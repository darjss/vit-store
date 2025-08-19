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
							className="flex items-center gap-1 font-heading text-muted-foreground text-sm transition-colors duration-200 hover:text-foreground"
						>
							<Home className="h-4 w-4" />
						</Link>
					</BreadcrumbItem>

					{breadcrumb_routes.length > 0 && (
						<BreadcrumbSeparator className="text-muted-foreground" />
					)}

					{breadcrumb_routes.map((crumb, index) => {
						const isLast = index === breadcrumb_routes.length - 1;

						const formattedName = crumb.name
							.replace(/-/g, " ")
							.replace(/\b\w/g, (l) => l.toUpperCase());

						if (isLast) {
							return (
								<BreadcrumbItem key={crumb.path}>
									<BreadcrumbPage className="font-heading text-foreground text-sm">
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
										className="font-heading text-muted-foreground text-sm transition-colors duration-200 hover:text-foreground"
									>
										{formattedName}
									</Link>
								</BreadcrumbItem>
								<BreadcrumbSeparator className="text-muted-foreground" />
							</div>
						);
					})}
				</BreadcrumbList>
			</Breadcrumb>
		</div>
	);
};
export default BreadCrumbs;

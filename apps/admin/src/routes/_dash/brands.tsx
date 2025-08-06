import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_dash/brands")({
  component: RouteComponent,
  loader({ context: ctx }) {
    return ctx.queryClient.ensureQueryData(
      ctx.trpc.brands.getAllBrands.queryOptions()
    );
  },
});

function RouteComponent() {
  const { data: brands } = useSuspenseQuery(
    trpc.brands.getAllBrands.queryOptions()
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Brands</h2>

        <Link to="/brands/add" className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add Brand
        </Link>
      </div>
      <div className="grid gap-4 sm:hidden">
        {brands.map((brand) => (
          <Card key={brand.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md">
                    {brand.logoUrl ? (
                      <Image
                        src={brand.logoUrl}
                        alt={brand.name}
                        height={800}
                        width={600}
                        layout="constrained"
                        className="object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xl font-semibold uppercase text-muted-foreground">
                        {brand.name[0]}
                      </div>
                    )}
                  </div>
                  <h3 className="font-medium">{brand.name}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop View */}
      <div className="hidden rounded-md border sm:block">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="py-3 pl-4 text-left text-sm font-medium">Logo</th>
              <th className="py-3 pl-4 text-left text-sm font-medium">Name</th>
              <th className="w-[100px] py-3 pl-4 text-left text-sm font-medium">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {brands.map((brand) => (
              <tr key={brand.id} className="border-b">
                <td className="py-3 pl-4">
                  <div className="relative h-10 w-10 overflow-hidden rounded-md">
                    {brand.logoUrl ? (
                      <Image
                        src={brand.logoUrl}
                        alt={brand.name}
                        height={800}
                        width={600}
                        layout="constrained"
                        className="object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-lg font-semibold uppercase text-muted-foreground">
                        {brand.name[0]}
                      </div>
                    )}
                  </div>
                </td>
                <td className="py-3 pl-4">{brand.name}</td>
                <td className="py-3 pl-4">fmpoiw</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

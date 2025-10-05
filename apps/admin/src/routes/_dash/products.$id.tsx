import { createFileRoute, useNavigate, useParams } from '@tanstack/react-router'
import { z } from 'zod';
import { useMutation, useQueryClient, useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query';
import { trpc } from '@/utils/trpc';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineChart } from '@/components/ui/line-chart';
import {
  ArrowLeft, 
  Package, 
  TrendingUp, 
  DollarSign, 
  ShoppingCart, 
  Eye,
  Edit,
  Activity,
  Calendar,
  Tag,
  Barcode,
  Info,
  ImageIcon,
  AlertCircle,
  CheckCircle,
  Clock,
  Archive
} from 'lucide-react';
import { useState } from 'react';
import { getStatusColor, getStockColor } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ProductForm from '@/components/product/product-form';
import { toast } from 'sonner';

export const Route = createFileRoute('/_dash/products/$id')({
  component: RouteComponent,
  params: z.object({
    id: z.coerce.number(),
  }),
  loader: async ({ params, context: ctx }) => {
    const id = params.id;
    const product = await ctx.queryClient.ensureQueryData(
      ctx.trpc.product.getProductById.queryOptions({ id }),
    );
    return { product };
  }
})

function RouteComponent() {
  const navigate = useNavigate();
  const { id } = useParams({ from: '/_dash/products/$id' });
  const { data: product } = useSuspenseQuery({
    ...trpc.product.getProductById.queryOptions({ id }),
  });

  const [{ data: brands }, { data: categories }] = useSuspenseQueries({
    queries: [
      trpc.brands.getAllBrands.queryOptions(),
      trpc.category.getAllCategories.queryOptions(),
    ],
  });
  
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [stockValue, setStockValue] = useState(product.stock);
  const queryClient = useQueryClient();
  
  const { mutate: setProductStock } = useMutation({
    ...trpc.product.setProductStock.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries(trpc.product.getProductById.queryOptions({ id }));
      toast.success('Stock updated successfully!');
    },
  });

  const brand = brands.find((b) => b.id === product.brandId);
  const category = categories.find((c) => c.id === product.categoryId);
  const primaryImage = product.images.find((img) => img.isPrimary)?.url || product.images[0]?.url;

  // Mock analytics data - in real app this would come from API
  const salesData = [
    { month: 'Jan', sales: 45, revenue: 12400 },
    { month: 'Feb', sales: 52, revenue: 14300 },
    { month: 'Mar', sales: 48, revenue: 13200 },
    { month: 'Apr', sales: 61, revenue: 16800 },
    { month: 'May', sales: 55, revenue: 15100 },
    { month: 'Jun', sales: 67, revenue: 18400 },
  ];

  const stockHistoryData = [
    { date: 'Week 1', stock: 120 },
    { date: 'Week 2', stock: 95 },
    { date: 'Week 3', stock: 110 },
    { date: 'Week 4', stock: product.stock },
  ];

  const totalSales = salesData.reduce((sum, item) => sum + item.sales, 0);
  const totalRevenue = salesData.reduce((sum, item) => sum + item.revenue, 0);
  const avgOrderValue = totalRevenue / totalSales;

  const handleStockUpdate = () => {
    setProductStock({ id: product.id, newStock: stockValue });
  };

  return (
    <div className="container mx-auto space-y-4 p-3 md:space-y-6 md:p-6">
      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-[900px]">
          <DialogHeader className="border-b px-6 pt-6 pb-4">
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>
              Update product details and information.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[80vh] overflow-y-auto p-2 sm:p-6">
            <ProductForm
              product={{
                id: product.id,
                name: product.name,
                description: product.description,
                dailyIntake: product.dailyIntake,
                brandId: product.brandId,
                categoryId: product.categoryId,
                amount: product.amount,
                potency: product.potency,
                status: product.status,
                stock: product.stock,
                price: product.price,
                images: product.images.map((img, idx) => ({ 
                  id: idx, 
                  url: img.url, 
                  isPrimary: img.isPrimary 
                })),
              }}
              onSuccess={() => {
                setIsEditDialogOpen(false);
                queryClient.invalidateQueries(trpc.product.getProductById.queryOptions({ id }));
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate({ to: '/products' })}
            className="h-9 w-9 shrink-0 border-2 border-border shadow-sm md:h-10 md:w-10"
          >
            <ArrowLeft className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold md:text-3xl">{product.name}</h1>
            <p className="truncate text-muted-foreground text-xs md:text-sm">
              {brand?.name} • {category?.name}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setIsEditDialogOpen(true)}
          className="shrink-0 border-2 border-border px-3 shadow-md md:px-4"
          size="sm"
        >
          <Edit className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Edit Product</span>
        </Button>
      </div>

      {/* Quick Stats Cards - Condensed */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="border-2 border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
            <CardTitle className="font-medium text-xs">Stock</CardTitle>
            <Package className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className={`font-bold text-xl ${getStockColor(product.stock)}`}>
              {product.stock}
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
            <CardTitle className="font-medium text-xs">Price</CardTitle>
            <DollarSign className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="font-bold text-xl">${product.price.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
            <CardTitle className="font-medium text-xs">Sales</CardTitle>
            <ShoppingCart className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="font-bold text-xl">{totalSales}</div>
          </CardContent>
        </Card>

        <Card className="border-2 border-border bg-card shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 pb-2">
            <CardTitle className="font-medium text-xs">Revenue</CardTitle>
            <Activity className="h-3 w-3 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="font-bold text-xl">${(totalRevenue/1000).toFixed(1)}k</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="overview" className="space-y-3 md:space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto">
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Eye className="mr-1 h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <TrendingUp className="mr-1 h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Analytics</span>
          </TabsTrigger>
          <TabsTrigger value="inventory" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Package className="mr-1 h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Inventory</span>
          </TabsTrigger>
          <TabsTrigger value="details" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Info className="mr-1 h-4 w-4 md:mr-2" />
            <span className="hidden sm:inline">Details</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Product Images */}
            <Card className="border-2 border-border shadow-sm lg:col-span-2">
              <CardHeader className="border-b-2 border-border p-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ImageIcon className="h-4 w-4" />
                  Images
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Primary Image */}
                  <div className="overflow-hidden rounded-base border-2 border-border bg-background">
                    <img
                      src={primaryImage || '/placeholder.jpg'}
                      alt={product.name}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                  {/* Thumbnail Gallery */}
                  <div className="grid grid-cols-3 gap-2">
                    {product.images.slice(0, 6).map((img, idx) => (
                      <div
                        key={idx}
                        className={`overflow-hidden rounded-base border-2 ${
                          img.isPrimary ? 'border-primary' : 'border-border'
                        } bg-background transition-all hover:shadow-sm`}
                      >
                        <img
                          src={img.url}
                          alt={`${product.name} ${idx + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Status & Actions Card */}
            <Card className="border-2 border-border shadow-sm">
              <CardHeader className="border-b-2 border-border p-3">
                <CardTitle className="text-sm">Status & Actions</CardTitle>
                </CardHeader>
              <CardContent className="space-y-3 p-3">
                <div className="flex items-center justify-center">
                  <Badge
                    className={`${getStatusColor(product.status)} border-2 border-border px-3 py-1.5 text-xs`}
                  >
                    {product.status === 'active' && <CheckCircle className="mr-1.5 h-3 w-3" />}
                    {product.status === 'draft' && <Clock className="mr-1.5 h-3 w-3" />}
                    {product.status === 'out_of_stock' && <Archive className="mr-1.5 h-3 w-3" />}
                    {product.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </div>
                
                <div className="space-y-1.5">
                  <Label htmlFor="stock" className="text-xs">Update Stock</Label>
                  <div className="flex gap-2">
                    <Input
                      id="stock"
                      type="number"
                      value={stockValue}
                      onChange={(e) => setStockValue(Number(e.target.value))}
                      className="h-8 border-2 border-border text-sm"
                    />
                    <Button 
                      onClick={handleStockUpdate}
                      className="h-8 border-2 border-border px-3 text-xs"
                      size="sm"
                    >
                      Update
                    </Button>
                  </div>
                </div>
                
                <Button
                  variant="outline"
                  className="h-8 w-full border-2 border-border text-xs"
                  onClick={() => setIsEditDialogOpen(true)}
                  size="sm"
                >
                  <Edit className="mr-1 h-3 w-3" />
                  Edit Product
                </Button>
                </CardContent>
              </Card>
          </div>

          {/* Full Width Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Card className="border-2 border-border shadow-sm">
              <CardHeader className="border-b-2 border-border p-3">
                <CardTitle className="text-sm">Details</CardTitle>
                </CardHeader>
              <CardContent className="space-y-2 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Brand</span>
                  <span className="font-semibold">{brand?.name || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Category</span>
                  <span className="font-semibold">{category?.name || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Potency</span>
                  <span className="font-semibold">{product.potency}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground text-xs">Amount</span>
                  <span className="font-semibold">{product.amount}</span>
                </div>
                </CardContent>
              </Card>

            <Card className="border-2 border-border shadow-sm">
              <CardHeader className="border-b-2 border-border p-3">
                <CardTitle className="text-sm">Description</CardTitle>
                </CardHeader>
              <CardContent className="p-3">
                <p className="leading-relaxed text-foreground text-sm">{product.description}</p>
                </CardContent>
              </Card>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-2 border-border shadow-md">
              <CardHeader className="border-b-2 border-border">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Sales Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <LineChart
                  data={salesData}
                  index="month"
                  categories={['sales']}
                  strokeColors={['var(--primary)']}
                  valueFormatter={(value) => `${value} units`}
                  className="h-64"
                />
              </CardContent>
            </Card>

            <Card className="border-2 border-border shadow-md">
              <CardHeader className="border-b-2 border-border">
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Revenue Trend
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <LineChart
                  data={salesData}
                  index="month"
                  categories={['revenue']}
                  strokeColors={['var(--foreground)']}
                  valueFormatter={(value) => `$${value.toLocaleString()}`}
                  className="h-64"
                />
              </CardContent>
            </Card>
          </div>

          <Card className="border-2 border-border shadow-md">
            <CardHeader className="border-b-2 border-border">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Key Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">Best Month</p>
                  <p className="font-bold text-2xl">June</p>
                  <p className="text-primary text-sm">67 units sold</p>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">Avg. Monthly Sales</p>
                  <p className="font-bold text-2xl">{(totalSales / 6).toFixed(0)}</p>
                  <p className="text-muted-foreground text-sm">units per month</p>
                </div>
                <div className="space-y-2">
                  <p className="text-muted-foreground text-sm">Revenue per Unit</p>
                  <p className="font-bold text-2xl">${avgOrderValue.toFixed(2)}</p>
                  <p className="text-muted-foreground text-sm">average order value</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Inventory Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-2 border-border shadow-md">
              <CardHeader className="border-b-2 border-border">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Stock History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <LineChart
                  data={stockHistoryData}
                  index="date"
                  categories={['stock']}
                  strokeColors={['var(--primary)']}
                  valueFormatter={(value) => `${value} units`}
                  className="h-64"
                />
              </CardContent>
            </Card>

            <Card className="border-2 border-border shadow-md">
              <CardHeader className="border-b-2 border-border">
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Stock Management
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b-2 border-border pb-4">
                    <div>
                      <p className="font-semibold">Current Stock Level</p>
                      <p className="text-muted-foreground text-sm">Units in warehouse</p>
                    </div>
                    <div className={`font-bold text-2xl ${getStockColor(product.stock)}`}>
                      {product.stock}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-b-2 border-border pb-4">
                    <div>
                      <p className="font-semibold">Reorder Point</p>
                      <p className="text-muted-foreground text-sm">Alert threshold</p>
                    </div>
                    <div className="font-bold text-2xl">50</div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">Days of Supply</p>
                      <p className="text-muted-foreground text-sm">At current sales rate</p>
                </div>
                    <div className="font-bold text-2xl">
                      {Math.floor(product.stock / (totalSales / 180))}
                  </div>
                  </div>
                </div>

                {product.stock < 50 && (
                  <div className="mt-4 flex items-center gap-2 rounded-base border-2 border-destructive bg-destructive/10 p-4">
                    <AlertCircle className="h-5 w-5 text-destructive" />
                    <p className="font-semibold text-destructive text-sm">
                      Low stock! Consider reordering soon.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="border-2 border-border shadow-md">
              <CardHeader className="border-b-2 border-border">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Product Specifications
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground text-sm">Product ID</p>
                    <p className="font-semibold">#{product.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Status</p>
                    <Badge className={`${getStatusColor(product.status)} border-2 border-border`}>
                      {product.status}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Price</p>
                    <p className="font-semibold">${product.price.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Discount</p>
                    <p className="font-semibold">{product.discount}%</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Stock</p>
                    <p className={`font-semibold ${getStockColor(product.stock)}`}>
                      {product.stock} units
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Amount</p>
                    <p className="font-semibold">{product.amount}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Potency</p>
                    <p className="font-semibold">{product.potency}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-sm">Daily Intake</p>
                    <p className="font-semibold">{product.dailyIntake}</p>
                  </div>
                  </div>
                </CardContent>
              </Card>

            <Card className="border-2 border-border shadow-md">
              <CardHeader className="border-b-2 border-border">
                <CardTitle className="flex items-center gap-2">
                  <Barcode className="h-5 w-5" />
                  Classification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-6">
                <div>
                  <p className="text-muted-foreground text-sm">Brand</p>
                  <p className="font-semibold text-lg">{brand?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Category</p>
                  <p className="font-semibold text-lg">{category?.name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Brand ID</p>
                  <p className="font-mono text-sm">#{product.brandId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Category ID</p>
                  <p className="font-mono text-sm">#{product.categoryId}</p>
            </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-2 border-border shadow-md">
            <CardHeader className="border-b-2 border-border">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Timestamps
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-muted-foreground text-sm">Created At</p>
                  <p className="font-semibold">
                    {new Date().toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Last Updated</p>
                  <p className="font-semibold">
                    {new Date().toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

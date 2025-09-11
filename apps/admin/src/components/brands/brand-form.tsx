import { zodResolver } from "@hookform/resolvers/zod";
import { addBrandSchema, type addBrandType } from "@server/lib/zod/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "@unpic/react";
import { X } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import { ImagePlaceholderIcon } from "../icons";
import SubmitButton from "../submit-button";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { UploadButton } from "../upload-button";

const BrandForm = ({
	brand,
	onSuccess,
}: {
	brand?: addBrandType;
	onSuccess: () => void;
}) => {
	const form = useForm({
		resolver: zodResolver(addBrandSchema),
		defaultValues: {
			name: brand?.name || "",
			logoUrl: brand?.logoUrl || "",
		},
	});

	const queryClient = useQueryClient();
	const mutation = useMutation({
		...trpc.brands.addBrand.mutationOptions(),
		onSuccess: async () => {
			form.reset();
			queryClient.invalidateQueries(trpc.brands.getAllBrands.queryOptions());
			onSuccess();
		},
		onError: (error) => {
			console.error("error", error);
			toast.error("Брэнд шинэчлэхэд алдаа гарлаа");
		},
	});
	const onSubmit = async (values: addBrandType) => {
		console.log("submitting values", values);
		mutation.mutate(values);
	};

	const currentImageUrl = brand ? brand.logoUrl : form.watch("logoUrl");

	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(onSubmit)}>
				<div className="grid grid-cols-1 gap-6">
					<Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
						<CardContent className="space-y-6 p-6">
							<h3 className="font-semibold text-xl">Брэндийн мэдээлэл</h3>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Брэндийн нэр</FormLabel>
										<FormControl>
											<Input placeholder="Брэндийн нэр оруулах" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="logoUrl"
								render={() => (
									<FormItem>
										<FormLabel>Лого зураг</FormLabel>
										<FormControl>
											<div className="flex flex-col items-center space-y-4">
												{currentImageUrl ? (
													<div className="group relative">
														<Button
															type="button"
															size="icon"
															variant="destructive"
															onClick={() =>
																form.setValue(
																	"logoUrl",
																	"https://www.placeholder.com/logo.png",
																)
															}
															className="-top-2 -right-2 absolute z-10 h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100"
														>
															<X className="h-3 w-3" />
														</Button>
														<Image
															src={currentImageUrl}
															alt={form.watch("name") || "Брэндийн лого"}
															width={120}
															height={120}
															layout="constrained"
															className="h-28 w-28 rounded-lg border-2 border-border bg-background object-contain p-3 shadow-sm"
														/>
													</div>
												) : (
													<div className="flex h-28 w-28 items-center justify-center rounded-lg border-2 border-border border-dashed bg-muted/30">
														<div className="text-center">
															<ImagePlaceholderIcon className="mx-auto h-10 w-10 text-muted-foreground" />
															<p className="mt-2 text-muted-foreground text-xs">
																Лого байршуулах
															</p>
														</div>
													</div>
												)}
												<UploadButton
													setValue={form.setValue}
													category="brand"
												/>
											</div>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
						</CardContent>
					</Card>

					<div className="flex justify-end">
						<SubmitButton
							isPending={form.formState.isSubmitting}
							className="w-full px-8 py-3 font-semibold text-lg transition-colors duration-300 hover:bg-primary/90 sm:w-auto"
						>
							{brand ? "Брэнд шинэчлэх" : "Брэнд нэмэх"}
						</SubmitButton>
					</div>
				</div>
			</form>
		</Form>
	);
};

export default BrandForm;

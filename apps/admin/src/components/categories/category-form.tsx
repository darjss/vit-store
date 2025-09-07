import { zodResolver } from "@hookform/resolvers/zod";
import { addCategorySchema, type addCategoryType } from "@server/lib/zod/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { trpc } from "@/utils/trpc";
import SubmitButton from "../submit-button";
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

const CategoryForm = ({
    category,
    onSuccess,
}: {
    category?: addCategoryType;
    onSuccess: () => void;
}) => {
    const form = useForm({
        resolver: zodResolver(addCategorySchema),
        defaultValues: {
            id: category?.id,
            name: category?.name || "",
        },
    });

    const queryClient = useQueryClient();
    const addMutation = useMutation({
        ...trpc.category.addCategory.mutationOptions(),
        onSuccess: async () => {
            form.reset();
            queryClient.invalidateQueries(
                trpc.category.getAllCategories.queryOptions(),
            );
            onSuccess();
        },
        onError: (error) => {
            console.error("error", error);
            toast.error("Ангилал нэмэхэд алдаа гарлаа");
        },
    });

    const updateMutation = useMutation({
        ...trpc.category.updateCategory.mutationOptions(),
        onSuccess: async () => {
            queryClient.invalidateQueries(
                trpc.category.getAllCategories.queryOptions(),
            );
            onSuccess();
        },
        onError: (error) => {
            console.error("error", error);
            toast.error("Ангилал шинэчлэхэд алдаа гарлаа");
        },
    });

    const onSubmit = async (values: addCategoryType) => {
        if (category?.id) {
            updateMutation.mutate({ id: category.id, name: values.name });
            return;
        }
        addMutation.mutate({ name: values.name });
    };

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="space-y-4 sm:space-y-6">
                    <Card className="overflow-hidden shadow-shadow">
                        <CardContent className="p-4 sm:p-6">
                            <h3 className="mb-4 font-bold text-base sm:text-lg">Ангиллын мэдээлэл</h3>
                            <div className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel className="text-sm sm:text-base">Ангиллын нэр</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Ангиллын нэр оруулах" {...field} className="h-10" />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="sticky bottom-0 bg-background py-3 sm:py-4">
                        <SubmitButton
                            isPending={form.formState.isSubmitting}
                            className="h-10 w-full rounded-base px-4 font-heading text-sm transition-transform hover:translate-x-boxShadowX hover:translate-y-boxShadowY"
                        >
                            {category ? "Ангилал шинэчлэх" : "Ангилал нэмэх"}
                        </SubmitButton>
                    </div>
                </div>
            </form>
        </Form>
    );
};

export default CategoryForm;



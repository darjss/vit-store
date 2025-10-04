import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import { Textarea } from "../ui/textarea";

const addCustomerSchema = z.object({
	phone: z
		.string()
		.min(8, { message: "Дугаар 8 оронтой байх ёстой" })
		.max(8, { message: "Дугаар 8 оронтой байх ёстой" })
		.regex(/^[6-9]\d{7}$/),
	address: z
		.string()
		.min(5, { message: "Хаяг хэт богино байна" })
		.optional()
		.or(z.literal("")),
});

export type AddCustomerFormValues = z.infer<typeof addCustomerSchema>;

type CustomerFormProps = {
    onSuccess: () => void;
    customer?: { phone: number; address?: string | null };
};

const CustomerForm = ({ onSuccess, customer }: CustomerFormProps) => {
    const form = useForm<AddCustomerFormValues>({
        resolver: zodResolver(addCustomerSchema),
        defaultValues: {
            phone: customer ? String(customer.phone) : "",
            address: customer?.address ?? "",
        },
    });

    const queryClient = useQueryClient();

    const addMutation = useMutation({
        ...trpc.customer.addUser.mutationOptions(),
        onSuccess: async () => {
            form.reset();
            queryClient.invalidateQueries(trpc.customer.getAllCustomers.queryOptions());
            onSuccess();
        },
        onError: (error) => {
            console.error("error", error);
            toast.error("Хэрэглэгч нэмэхэд алдаа гарлаа");
        },
    });

    const updateMutation = useMutation({
        ...trpc.customer.updateCustomer.mutationOptions(),
        onSuccess: async () => {
            queryClient.invalidateQueries(trpc.customer.getAllCustomers.queryOptions());
            onSuccess();
        },
        onError: (error) => {
            console.error("error", error);
            toast.error("Хэрэглэгч засахад алдаа гарлаа");
        },
    });

    const onSubmit = (values: AddCustomerFormValues) => {
        if (customer) {
            updateMutation.mutate({
                phone: Number(customer.phone),
                address: values.address || undefined,
            });
            return;
        }
        addMutation.mutate({
            phone: Number(values.phone),
            address: values.address || undefined,
        });
    };

    const isEditing = Boolean(customer);

    return (
        <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid grid-cols-1 gap-6">
                    <Card className="shadow-md transition-shadow duration-300 hover:shadow-lg">
                        <CardContent className="space-y-6 p-6">
                            <h3 className="font-semibold text-xl">
                                {isEditing ? "Хэрэглэгч засах" : "Хэрэглэгчийн мэдээлэл"}
                            </h3>
                            <FormField
                                control={form.control}
                                name="phone"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Утасны дугаар</FormLabel>
                                        <FormControl>
                                            <Input
                                                inputMode="numeric"
                                                placeholder="8 оронтой дугаар"
                                                maxLength={8}
                                                disabled={isEditing}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="address"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Хаяг </FormLabel>
                                        <FormControl>
                                            <Textarea placeholder="Хаяг оруулах" {...field} />
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
                            {isEditing ? "Хадгалах" : "Хэрэглэгч нэмэх"}
                        </SubmitButton>
                    </div>
                </div>
            </form>
        </Form>
    );
};

export default CustomerForm;



import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin, Phone } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import RowAction from "@/components/row-actions";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import CustomerForm from "./customer-form";
import { trpc } from "@/utils/trpc";

type Customer = {
	phone: number;
	address?: string | null;
	createdAt: number | Date;
};

const CustomerCard = ({ customer }: { customer: Customer }) => {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const queryClient = useQueryClient();
	const { mutate: deleteCustomer, isPending } = useMutation({
		...trpc.customer.deleteCustomer.mutationOptions(),
		onSuccess: async () => {
			queryClient.invalidateQueries(
				trpc.customer.getAllCustomers.queryOptions(),
			);
		},
	});

	return (
		<>
			<Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-md">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Хэрэглэгч засах</DialogTitle>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-6">
						<CustomerForm
							customer={customer}
							onSuccess={() => setIsEditOpen(false)}
						/>
					</div>
				</DialogContent>
			</Dialog>

			<Card className="rounded-base border-2 border-border">
				<CardContent className="p-3">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<Phone className="h-4 w-4 text-muted-foreground" />
								<Text as="h4" className="font-semibold tracking-wide">
									{customer.phone}
								</Text>
							</div>
							<div className="mt-1 inline-flex items-center gap-1 text-muted-foreground text-xs">
								<Calendar className="h-3.5 w-3.5" />
								<span>{new Date(customer.createdAt).toLocaleDateString()}</span>
							</div>
						</div>
						<RowAction
							id={customer.phone}
							setIsEditDialogOpen={setIsEditOpen}
							deleteMutation={(id) => deleteCustomer({ phone: id })}
							isDeletePending={isPending}
						/>
					</div>

					<div className="mt-2 flex items-start gap-2">
						<MapPin className="mt-0.5 h-4 w-4 text-muted-foreground shrink-0" />
						<Text className="text-sm font-medium leading-snug">
							{customer.address || "Хаяг байхгүй"}
						</Text>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default CustomerCard;

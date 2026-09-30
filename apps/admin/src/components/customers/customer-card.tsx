import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, MapPin, Phone } from "lucide-react";
import { useState } from "react";
import RowAction from "@/components/row-actions";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Text } from "@/components/ui/text";
import { trpc } from "@/utils/trpc";
import CustomerForm from "./customer-form";

type Customer = {
	address?: string | null;
	createdAt: number | Date;
	phone: number;
};

const CustomerCard = ({ customer }: { customer: Customer }) => {
	const [isEditOpen, setIsEditOpen] = useState(false);
	const queryClient = useQueryClient();
	const { isPending, mutate: deleteCustomer } = useMutation({
		...trpc.customer.deleteCustomer.mutationOptions(),
		onSuccess: async () => {
			queryClient.invalidateQueries(trpc.customer.getAllCustomers.queryOptions());
		},
	});

	return (
		<>
			<Dialog onOpenChange={setIsEditOpen} open={isEditOpen}>
				<DialogContent className="max-w-[95vw] overflow-hidden p-0 sm:max-w-md">
					<DialogHeader className="border-b px-6 pt-6 pb-4">
						<DialogTitle>Хэрэглэгч засах</DialogTitle>
					</DialogHeader>
					<div className="max-h-[80vh] overflow-y-auto p-6">
						<CustomerForm customer={customer} onSuccess={() => setIsEditOpen(false)} />
					</div>
				</DialogContent>
			</Dialog>

			<Card className="rounded-base border-border border-2">
				<CardContent className="p-3">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<Phone className="text-muted-foreground h-4 w-4" />
								<Text as="h4" className="font-semibold tracking-wide">
									{customer.phone}
								</Text>
							</div>
							<div className="text-muted-foreground mt-1 inline-flex items-center gap-1 text-xs">
								<Calendar className="h-3.5 w-3.5" />
								<span>{new Date(customer.createdAt).toLocaleDateString()}</span>
							</div>
						</div>
						<RowAction
							deleteMutation={(id) => deleteCustomer({ phone: id })}
							id={customer.phone}
							isDeletePending={isPending}
							setIsEditDialogOpen={setIsEditOpen}
						/>
					</div>

					<div className="mt-2 flex items-start gap-2">
						<MapPin className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
						<Text className="text-sm leading-snug font-medium">
							{customer.address || "Хаяг байхгүй"}
						</Text>
					</div>
				</CardContent>
			</Card>
		</>
	);
};

export default CustomerCard;

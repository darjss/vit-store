import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Banknote, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/utils/trpc";
import PendingTransferDialog from "./pending-transfer-dialog";

export default function PendingTransferWidget() {
	const navigate = useNavigate();
	const [dialogOpen, setDialogOpen] = useState(false);
	const claimedCount = useQuery(trpc.payment.getClaimedTransferCount.queryOptions());

	if (!claimedCount.data || claimedCount.data <= 0) {
		return null;
	}

	return (
		<>
			<div className="border-2 border-primary bg-primary/10 p-3 shadow-hard-sm">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<div className="flex items-start gap-3">
						<div className="flex h-10 w-10 shrink-0 items-center justify-center border-2 border-border bg-card shadow-hard-sm">
							<Banknote className="h-5 w-5 text-primary" />
						</div>
						<div>
							<p className="font-bold">
								{claimedCount.data} шилжүүлэг баталгаажуулах хүлээж байна
							</p>
							<p className="text-muted-foreground text-sm">
								Хэрэглэгч төлсөн гэж мэдэгдсэн захиалгуудыг эндээс шалгаж баталгаажуулна
							</p>
						</div>
					</div>
					<div className="flex flex-wrap gap-2">
						<Button
							size="sm"
							className="gap-1.5 shadow-hard-sm"
							onClick={() => setDialogOpen(true)}
						>
							Шалгах
							<ChevronRight className="h-4 w-4" />
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								navigate({
									to: "/orders",
									search: { paymentStatus: "customer_claimed_paid", page: 1 },
								})
							}
						>
							Жагсаалтаар харах
						</Button>
					</div>
				</div>
			</div>

			<PendingTransferDialog open={dialogOpen} onOpenChange={setDialogOpen} />
		</>
	);
}

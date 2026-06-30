import { createSignal } from "solid-js";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import IconTruck from "~icons/ri/truck-line";
import IconMapPin from "~icons/ri/map-pin-line";
import IconTime from "~icons/ri/time-line";
import IconAlert from "~icons/ri/alert-line";

const deliveryInfo = [
	{
		icon: IconMapPin,
		title: "Улаанбаатар",
		desc: "Улаанбаатар хотын бүх дүүрэгт хүргэлт хийнэ. Доорх газрын зураг дээр хүргэлтийн бүсийг харна уу.",
	},
	{
		icon: IconTruck,
		title: "Хөдөө орон нутаг",
		desc: 'Улаанбаатарын бусад аймаг, сумдад "Замын Унаа"-ар хүргэлт хийнэ. Тээврийн зардал харилцагчийн өөрийн зөөлөг болно.',
	},
	{
		icon: IconTime,
		title: "Хүргэлтийн хугацаа",
		desc: "Захиалгыг өдөр бүр 12:00 цагаас хойш хүргэнэ. Өглөөний захиалгыг өдөрт нь, оройн захиалгыг маргааш хүргэнэ.",
	},
];

export default function DeliveryInfoSheet() {
	const [open, setOpen] = createSignal(false);

	return (
		<Sheet open={open()} onOpenChange={setOpen}>
			<SheetTrigger
				as="button"
				type="button"
				class="inline-flex items-center gap-1 font-bold text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
			>
				<span>Дэлгэрэнгүй</span>
			</SheetTrigger>
			<SheetContent position="bottom" class="border-t-2 border-border">
				<SheetHeader class="text-left">
					<SheetTitle class="font-black text-lg uppercase tracking-tight">
						Хүргэлтийн мэдээлэл
					</SheetTitle>
				</SheetHeader>

				<div class="mt-4 space-y-5 pb-6">
					{/* Delivery Zone Map */}
					<div class="border border-border bg-card p-3">
						<h3 class="mb-2 font-black text-xs uppercase tracking-wider">
							Улаанбаатар хотын хүргэлтийн бүс
						</h3>
						<div class="border border-border bg-muted/30 overflow-hidden">
							<img
								src="/delivery-zone.png"
								alt="Улаанбаатар хотын хүргэлтийн бүсийн зураг"
								class="h-auto w-full object-contain"
								loading="lazy"
							/>
						</div>
						<p class="mt-2 text-xs font-medium text-muted-foreground">
							Дээрх зураг дээрх бүсүүдэд стандарт хүргэлтийн хураамж
							тооцогдоно.
						</p>
					</div>

					{/* Delivery Info Cards */}
					<div class="grid gap-3">
						{deliveryInfo.map((item) => (
							<div class="border border-border bg-card p-4">
								<div class="mb-2 flex items-center gap-2">
									<div class="flex h-8 w-8 items-center justify-center border border-border bg-primary">
										<item.icon class="h-4 w-4" />
									</div>
									<h3 class="font-black text-xs uppercase tracking-wider">
										{item.title}
									</h3>
								</div>
								<p class="text-xs font-medium leading-relaxed text-muted-foreground">
									{item.desc}
								</p>
							</div>
						))}
					</div>

					{/* Important Notice */}
					<div class="border border-border bg-yellow-50 p-4">
						<div class="flex items-start gap-2.5">
							<div class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-primary">
								<IconAlert class="h-3.5 w-3.5" />
							</div>
							<div>
								<h3 class="mb-1.5 font-black text-xs uppercase tracking-wider">
									Чухал анхааруулга
								</h3>
								<ul class="space-y-1 text-xs font-medium leading-relaxed">
									<li>
										• Хүргэлт{" "}
										<strong>зөвхөн Монгол улсын дотоодод</strong>{" "}
										хийгдэнэ.
									</li>
									<li>• Олон улсын хүргэлт хийдэггүй.</li>
									<li>
										• Хөдөө рүү хүргэхдээ "Замын Унаа"-ар илгээдэг бөгөөд
										тээврийн зардал хүлээн авагчийн хариуцах болно.
									</li>
									<li>
										• Хүргэлтийн хураамж захиалгын дүн дээр нэмэгдэнэ.
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

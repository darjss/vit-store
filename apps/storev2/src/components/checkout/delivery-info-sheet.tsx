import { createSignal } from "solid-js";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
	DeliveryIcon as IconTruck,
	MapPointIcon as IconMapPin,
	ClockCircleIcon as IconTime,
} from "@solar-icons/solid/linear";
import { DangerTriangleIcon as IconAlert } from "@solar-icons/solid/bold";

const deliveryInfo = [
	{
		desc: "Улаанбаатар хотын бүх дүүрэгт хүргэлт хийнэ. Доорх газрын зураг дээр хүргэлтийн бүсийг харна уу.",
		icon: IconMapPin,
		title: "Улаанбаатар",
		wash: "bg-wash-sky",
	},
	{
		desc: 'Улаанбаатарын бусад аймаг, сумдад "Замын Унаа"-ар хүргэлт хийнэ. Тээврийн зардал харилцагчийн өөрийн зөөлөг болно.',
		icon: IconTruck,
		title: "Хөдөө орон нутаг",
		wash: "bg-wash-mint",
	},
	{
		desc: "Захиалгыг өдөр бүр 12:00 цагаас хойш хүргэнэ. Өглөөний захиалгыг өдөрт нь, оройн захиалгыг маргааш хүргэнэ.",
		icon: IconTime,
		title: "Хүргэлтийн хугацаа",
		wash: "bg-wash-peach",
	},
];

export default function DeliveryInfoSheet() {
	const [open, setOpen] = createSignal(false);

	return (
		<Sheet onOpenChange={setOpen} open={open()}>
			<SheetTrigger
				as="button"
				class="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1 text-xs font-semibold underline-offset-2 transition-colors duration-[140ms] ease-out hover:underline focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
				type="button"
			>
				<span>Дэлгэрэнгүй</span>
			</SheetTrigger>
			<SheetContent
				class="border-border bg-background rounded-t-3xl border-t ease-(--ease-drawer) data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
				closeLabel="Хүргэлтийн мэдээллийг хаах"
				position="bottom"
			>
				<SheetHeader class="text-left">
					<SheetTitle class="font-display text-foreground text-lg">Хүргэлтийн мэдээлэл</SheetTitle>
				</SheetHeader>

				<div class="mt-4 space-y-4 pb-6">
					{/* Delivery Zone Map */}
					<div class="border-border bg-card shadow-soft-sm rounded-2xl border p-3">
						<h3 class="text-foreground mb-2 text-xs font-semibold tracking-wider uppercase">
							Улаанбаатар хотын хүргэлтийн бүс
						</h3>
						<div class="bg-muted/30 overflow-hidden rounded-xl">
							<img
								alt="Улаанбаатар хотын хүргэлтийн бүсийн зураг"
								class="h-auto w-full object-contain"
								loading="lazy"
								src="/delivery-zone.png"
							/>
						</div>
						<p class="text-muted-foreground mt-2 text-xs">
							Дээрх зураг дээрх бүсүүдэд стандарт хүргэлтийн хураамж тооцогдоно.
						</p>
					</div>

					{/* Delivery Info Cards */}
					<div class="grid gap-3">
						{deliveryInfo.map((item) => (
							<div class="border-border bg-card shadow-soft-sm rounded-2xl border p-4">
								<div class="mb-2 flex items-center gap-2.5">
									<div class={`flex size-8 items-center justify-center rounded-full ${item.wash}`}>
										<item.icon aria-hidden="true" class="h-4 w-4" />
									</div>
									<h3 class="text-foreground text-sm font-semibold">{item.title}</h3>
								</div>
								<p class="text-muted-foreground text-xs leading-relaxed">{item.desc}</p>
							</div>
						))}
					</div>

					{/* Important Notice */}
					<div class="bg-warning/40 rounded-2xl p-4">
						<div class="flex items-start gap-2.5">
							<div class="bg-warning mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full">
								<IconAlert aria-hidden="true" class="text-warning-foreground h-3.5 w-3.5" />
							</div>
							<div>
								<h3 class="text-foreground mb-1.5 text-sm font-semibold">Чухал анхааруулга</h3>
								<ul class="text-foreground/80 space-y-1 text-xs leading-relaxed">
									<li>
										• Хүргэлт <strong>зөвхөн Монгол улсын дотоодод</strong> хийгдэнэ.
									</li>
									<li>• Олон улсын хүргэлт хийдэггүй.</li>
									<li>
										• Хөдөө рүү хүргэхдээ "Замын Унаа"-ар илгээдэг бөгөөд тээврийн зардал хүлээн
										авагчийн хариуцах болно.
									</li>
									<li>• Хүргэлтийн хураамж захиалгын дүн дээр нэмэгдэнэ.</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

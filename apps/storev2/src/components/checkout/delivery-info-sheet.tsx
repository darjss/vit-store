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
		wash: "bg-wash-sky",
		title: "Улаанбаатар",
		desc: "Улаанбаатар хотын бүх дүүрэгт хүргэлт хийнэ. Доорх газрын зураг дээр хүргэлтийн бүсийг харна уу.",
	},
	{
		icon: IconTruck,
		wash: "bg-wash-mint",
		title: "Хөдөө орон нутаг",
		desc: 'Улаанбаатарын бусад аймаг, сумдад "Замын Унаа"-ар хүргэлт хийнэ. Тээврийн зардал харилцагчийн өөрийн зөөлөг болно.',
	},
	{
		icon: IconTime,
		wash: "bg-wash-peach",
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
				class="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1 font-semibold text-muted-foreground text-xs underline-offset-2 transition-colors duration-[140ms] ease-out hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			>
				<span>Дэлгэрэнгүй</span>
			</SheetTrigger>
			<SheetContent
				position="bottom"
				closeLabel="Хүргэлтийн мэдээллийг хаах"
				class="rounded-t-3xl border-border border-t bg-background ease-(--ease-drawer) data-[closed=]:duration-[250ms] data-[expanded=]:duration-[450ms]"
			>
				<SheetHeader class="text-left">
					<SheetTitle class="font-display text-foreground text-lg">
						Хүргэлтийн мэдээлэл
					</SheetTitle>
				</SheetHeader>

				<div class="mt-4 space-y-4 pb-6">
					{/* Delivery Zone Map */}
					<div class="rounded-2xl border border-border bg-card p-3 shadow-soft-sm">
						<h3 class="mb-2 font-semibold text-foreground text-xs uppercase tracking-wider">
							Улаанбаатар хотын хүргэлтийн бүс
						</h3>
						<div class="overflow-hidden rounded-xl bg-muted/30">
							<img
								src="/delivery-zone.png"
								alt="Улаанбаатар хотын хүргэлтийн бүсийн зураг"
								class="h-auto w-full object-contain"
								loading="lazy"
							/>
						</div>
						<p class="mt-2 text-muted-foreground text-xs">
							Дээрх зураг дээрх бүсүүдэд стандарт хүргэлтийн хураамж
							тооцогдоно.
						</p>
					</div>

					{/* Delivery Info Cards */}
					<div class="grid gap-3">
						{deliveryInfo.map((item) => (
							<div class="rounded-2xl border border-border bg-card p-4 shadow-soft-sm">
								<div class="mb-2 flex items-center gap-2.5">
									<div
										class={`flex size-8 items-center justify-center rounded-full ${item.wash}`}
									>
										<item.icon class="h-4 w-4" aria-hidden="true" />
									</div>
									<h3 class="font-semibold text-foreground text-sm">
										{item.title}
									</h3>
								</div>
								<p class="text-muted-foreground text-xs leading-relaxed">
									{item.desc}
								</p>
							</div>
						))}
					</div>

					{/* Important Notice */}
					<div class="rounded-2xl bg-warning/40 p-4">
						<div class="flex items-start gap-2.5">
							<div class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-warning">
								<IconAlert
									class="h-3.5 w-3.5 text-warning-foreground"
									aria-hidden="true"
								/>
							</div>
							<div>
								<h3 class="mb-1.5 font-semibold text-foreground text-sm">
									Чухал анхааруулга
								</h3>
								<ul class="space-y-1 text-foreground/80 text-xs leading-relaxed">
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

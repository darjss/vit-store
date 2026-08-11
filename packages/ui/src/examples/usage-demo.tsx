/*
 * Route-free usage example proving every public export imports and
 * typechecks. Not part of the package API — the admin app (Track 2) owns
 * routes and screens. Delete once apps/admin-v2 consumes @vit/ui.
 */
import { CheckCircleIcon } from "@solar-icons/solid/linear/check-circle";
import { createSignal, For, Show } from "solid-js";

import {
	Badge,
	Button,
	Combobox,
	ComboboxContent,
	ComboboxControl,
	ComboboxError,
	ComboboxHiddenSelect,
	ComboboxIcon,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIndicator,
	ComboboxItemLabel,
	ComboboxLabel,
	ComboboxTrigger,
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
	EmptyState,
	Field,
	FormSection,
	IconButton,
	InlineAlert,
	Input,
	InputError,
	InputLabel,
	Menu,
	MenuContent,
	MenuItem,
	MenuTrigger,
	Select,
	SelectContent,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
	Skeleton,
	showToast,
	showToastPromise,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	TextArea,
	Toast,
	ToastClose,
	ToastDescription,
	Toaster,
	ToastTitle,
} from "../index";
import { cn } from "../lib/cn";

const STATUSES: string[] = ["active", "draft", "out_of_stock"];

type Product = { id: string; name: string; stock: number; status: string };

const PRODUCTS: Product[] = [
	{ id: "p1", name: "Боов", stock: 12, status: "active" },
	{ id: "p2", name: "Хиймэл будаа", stock: 2, status: "out_of_stock" },
];

export function UsageDemo() {
	const [tab, setTab] = createSignal("orders");
	const [selected, setSelected] = createSignal<string>("");
	const [comboboxValue, setComboboxValue] = createSignal<Product | null>(null);

	const ship = () =>
		showToastPromise(
			async () => {
				await new Promise((resolve) => setTimeout(resolve, 300));
				return { ok: true };
			},
			{
				loading: "Илгээж байна…",
				success: () => "Хүргэлтэд гаргалаа",
				error: () => "Амжилтгүй",
			},
		);

	return (
		<div class={cn("ui-stage min-h-dvh p-4")}>
			<Toaster />

			<Button
				onClick={() => showToast({ title: "Хадгаллаа", variant: "success" })}
			>
				Хадгалах
			</Button>
			<IconButton label="Хайх">Х</IconButton>
			<Button loading variant="secondary">
				Ачаалж байна
			</Button>
			<Button variant="destructive">Цуцлах</Button>

			<Badge icon={<CheckCircleIcon />} tone="lavender">
				Хүргэлтэд
			</Badge>
			<Badge tone="coral">Дууссан</Badge>

			<Field label="Барааны нэр" description="Дэлгүүрт харагдах нэр">
				<Input placeholder="Жишээ нь: Боов" />
			</Field>
			<Field error="Тайлбар оруулна уу" label="Тайлбар">
				<TextArea />
			</Field>

			<InputLabel>Шууд хэрэглээ</InputLabel>
			<Input placeholder="..." />
			<InputError>Алдаа</InputError>

			<Select
				itemComponent={(props) => (
					<SelectItem item={props.item}>{props.item.rawValue}</SelectItem>
				)}
				onChange={(value) => setSelected(value ?? "")}
				optionTextValue={(s) => s}
				optionValue={(s) => s}
				options={STATUSES}
				placeholder="Төлөв сонгох"
				value={selected()}
			>
				<SelectLabel>Төлөв</SelectLabel>
				<SelectTrigger>
					<SelectValue<string>>
						{(state) => state.selectedOption() ?? "Сонгох"}
					</SelectValue>
				</SelectTrigger>
				<SelectContent />
			</Select>

			<Combobox
				itemComponent={(props) => (
					<ComboboxItem item={props.item}>
						<ComboboxItemLabel>{props.item.rawValue.name}</ComboboxItemLabel>
						<ComboboxItemIndicator />
					</ComboboxItem>
				)}
				onChange={(value) => setComboboxValue(value)}
				optionLabel={(p) => p.name}
				optionTextValue={(p) => p.name}
				optionValue={(p) => p.id}
				options={PRODUCTS}
				placeholder="Бараа хайх"
				value={comboboxValue()}
			>
				<ComboboxLabel>Бараа</ComboboxLabel>
				<ComboboxControl>
					<ComboboxInput />
					<ComboboxTrigger>
						<ComboboxIcon />
					</ComboboxTrigger>
				</ComboboxControl>
				<ComboboxHiddenSelect />
				<ComboboxContent />
			</Combobox>
			<ComboboxError>Олдсонгүй</ComboboxError>

			<Menu>
				<MenuTrigger as={Button} variant="secondary">
					Үйлдлүүд
				</MenuTrigger>
				<MenuContent>
					<MenuItem onSelect={() => ship()}>Хүргэлтэд гаргах</MenuItem>
					<MenuItem onSelect={() => {}}>Дэлгэрэнгүй</MenuItem>
				</MenuContent>
			</Menu>

			<Dialog>
				<DialogTrigger as={Button} variant="secondary">
					Захиалга цуцлах
				</DialogTrigger>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Захиалга цуцлах уу?</DialogTitle>
						<DialogDescription>
							Цуцласны дараа буцаах боломжгүй.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="ghost">Болих</Button>
						<Button variant="destructive">Цуцлах</Button>
					</DialogFooter>
					<DialogCloseButton />
				</DialogContent>
			</Dialog>

			<Drawer>
				<DrawerTrigger as={Button} variant="secondary">
					Хүргэлт нээх
				</DrawerTrigger>
				<DrawerContent>
					<DrawerHeader>
						<DrawerTitle>Хүргэлтийн бүс</DrawerTitle>
						<DrawerDescription>Хүргэлтийн бүсээ сонгоно уу.</DrawerDescription>
					</DrawerHeader>
					<DrawerFooter>
						<Button>Илгээх</Button>
					</DrawerFooter>
				</DrawerContent>
			</Drawer>

			<Tabs onChange={setTab} value={tab()}>
				<TabsList>
					<TabsTrigger value="orders">Захиалга</TabsTrigger>
					<TabsTrigger value="products">Бараа</TabsTrigger>
				</TabsList>
				<TabsContent value="orders">Захиалгын жагсаалт</TabsContent>
				<TabsContent value="products">
					<For each={PRODUCTS}>
						{(product) => (
							<div>
								{product.name} · {product.stock}
							</div>
						)}
					</For>
				</TabsContent>
			</Tabs>

			<FormSection
				description="Барааны үндсэн мэдээлэл"
				title="Үндсэн мэдээлэл"
			>
				<Field label="Үнэ">
					<Input type="number" />
				</Field>
			</FormSection>

			<InlineAlert title="Хадгалж чадсангүй" tone="error">
				Холболтоо шалгаад дахин оролдоно уу.
			</InlineAlert>

			<EmptyState
				action={<Button variant="secondary">Шүүлт цэвэрлэх</Button>}
				description="Шүүлтээ өөрчилж үзнэ үү."
				title="Захиалга олдсонгүй"
			/>

			<Skeleton class="h-12 w-40" />

			<Show when={false}>
				<Toast toastId={1} variant="success">
					<ToastTitle>Амжилттай</ToastTitle>
					<ToastDescription>Хадгаллаа</ToastDescription>
					<ToastClose />
				</Toast>
			</Show>
		</div>
	);
}

import { Link } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, Home, RotateCcw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Text } from "@/components/ui/text";

interface AppErrorProps {
	error: unknown;
}

export default function AppError({ error }: AppErrorProps) {
	const [open, setOpen] = useState(false);
	const { message, raw, stack } = useMemo(() => {
		if (error instanceof Error) {
			return {
				message: error.message,
				raw: String(error),
				stack: error.stack || "",
			};
		}
		try {
			const asString = typeof error === "string" ? error : JSON.stringify(error, null, 2);
			return { message: asString, raw: asString, stack: "" };
		} catch {
			return { message: "Тодорхойгүй алдаа.", raw: String(error), stack: "" };
		}
	}, [error]);

	return (
		<div className="relative grid min-h-screen place-items-center p-6">
			<div
				className="absolute inset-0 z-0"
				style={{
					background: "white",
					backgroundImage: `
						linear-gradient(to right, rgba(71,85,105,0.15) 1px, transparent 1px),
						linear-gradient(to bottom, rgba(71,85,105,0.15) 1px, transparent 1px),
						radial-gradient(circle at center, #FFF991 0%, transparent 70%)
					`,
					backgroundSize: "40px 40px, 40px 40px, 100% 100%",
					mixBlendMode: "multiply",
					opacity: 0.6,
				}}
			/>
			<div className="rounded-base border-border bg-card shadow-shadow relative z-10 w-full max-w-2xl space-y-4 border-2 p-6">
				<div className="flex items-start gap-3">
					<div className="rounded-base border-border border-2 bg-red-300 p-2 text-red-900">
						<TriangleAlert className="h-6 w-6" />
					</div>
					<div className="space-y-1">
						<Text as="h2">Алдаа гарлаа</Text>
						<Text className="text-muted-foreground">Та хөгжүүлэгчидтэй холбогдоно уу.</Text>
					</div>
				</div>

				<Alert className="rounded-base" status="error">
					<Alert.Title>Алдааны мэдээлэл</Alert.Title>
					<Alert.Description>
						<Text className="break-words">{message || "Тодорхойгүй алдаа."}</Text>
					</Alert.Description>
				</Alert>

				<div className="flex flex-wrap items-center gap-2">
					<Button onClick={() => window.history.back()} variant="outline">
						<ArrowLeft className="mr-2 h-4 w-4" />
						Өмнөх хуудас
					</Button>
					<Link to="/">
						<Button>
							<Home className="mr-2 h-4 w-4" />
							Нүүр хуудас
						</Button>
					</Link>
					<Button onClick={() => window.location.reload()} variant="secondary">
						<RotateCcw className="mr-2 h-4 w-4" />
						Дахин ачаалах
					</Button>

					<DropdownMenu onOpenChange={setOpen} open={open}>
						<DropdownMenuTrigger asChild>
							<Button variant="outline">
								<ChevronDown className="mr-2 h-4 w-4" />
								Дэлгэрэнгүй
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[min(90vw,640px)] p-2">
							<DropdownMenuLabel>Алдааны дэлгэрэнгүй</DropdownMenuLabel>
							<DropdownMenuSeparator />
							<div className="space-y-2">
								{raw && (
									<div className="rounded-base border-border bg-background border-2 p-2">
										<Text className="font-mono text-sm">{raw}</Text>
									</div>
								)}
								{stack && (
									<div className="rounded-base border-border border-2">
										<ScrollArea className="h-60 w-full">
											<pre className="p-3 font-mono text-xs whitespace-pre-wrap">{stack}</pre>
										</ScrollArea>
									</div>
								)}
							</div>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>
		</div>
	);
}

import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	ChevronDown,
	Home,
	RotateCcw,
	TriangleAlert,
} from "lucide-react";
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
import { getCorrelationId } from "@/lib/error-presentations";

interface AppErrorProps {
	error: unknown;
}

const developmentDetails = (error: unknown) => {
	if (error instanceof Error) {
		return {
			message: error.message || "Тодорхойгүй алдаа.",
			stack: error.stack || "",
		};
	}
	try {
		return {
			message:
				typeof error === "string" ? error : JSON.stringify(error, null, 2),
			stack: "",
		};
	} catch {
		return { message: "Тодорхойгүй алдаа.", stack: "" };
	}
};

export default function AppError({ error }: AppErrorProps) {
	const [open, setOpen] = useState(false);
	const correlationId = getCorrelationId(error);
	const details = useMemo(
		() => (import.meta.env.DEV ? developmentDetails(error) : undefined),
		[error],
	);

	return (
		<div className="relative grid min-h-screen place-items-center bg-background p-6">
			<div className="relative z-10 w-full max-w-2xl space-y-4 border-2 border-border bg-card p-6 shadow-hard">
				<div className="flex items-start gap-3">
					<div className="border-2 border-border bg-red-300 p-2 text-red-900">
						<TriangleAlert className="h-6 w-6" aria-hidden="true" />
					</div>
					<div className="space-y-1">
						<Text as="h2">Хуудсыг нээж чадсангүй</Text>
						<Text className="text-muted-foreground">
							Түр хүлээгээд дахин ачаална уу. Оруулсан мэдээллээ шалгаад
							аюулгүйгээр дахин оролдож болно.
						</Text>
					</div>
				</div>

				{correlationId ? (
					<Alert status="error">
						<Alert.Title>Алдааны дугаар</Alert.Title>
						<Alert.Description>
							<Text className="break-all font-mono text-sm">
								{correlationId}
							</Text>
						</Alert.Description>
					</Alert>
				) : null}

				<div className="flex flex-wrap items-center gap-2">
					<Button variant="outline" onClick={() => window.history.back()}>
						<ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
						Өмнөх хуудас
					</Button>
					<Link to="/">
						<Button>
							<Home className="mr-2 h-4 w-4" aria-hidden="true" />
							Нүүр хуудас
						</Button>
					</Link>
					<Button variant="secondary" onClick={() => window.location.reload()}>
						<RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
						Дахин ачаалах
					</Button>

					{details ? (
						<DropdownMenu open={open} onOpenChange={setOpen}>
							<DropdownMenuTrigger asChild>
								<Button variant="outline">
									<ChevronDown className="mr-2 h-4 w-4" aria-hidden="true" />
									Хөгжүүлэлтийн мэдээлэл
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-[min(90vw,640px)] p-2">
								<DropdownMenuLabel>
									Зөвхөн хөгжүүлэлтийн орчин
								</DropdownMenuLabel>
								<DropdownMenuSeparator />
								<Text className="break-words font-mono text-sm">
									{details.message}
								</Text>
								{details.stack ? (
									<ScrollArea className="mt-2 h-60 w-full border-2 border-border">
										<pre className="whitespace-pre-wrap p-3 font-mono text-xs">
											{details.stack}
										</pre>
									</ScrollArea>
								) : null}
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</div>
			</div>
		</div>
	);
}

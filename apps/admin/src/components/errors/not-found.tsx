import { Link } from "@tanstack/react-router";
import { Home, MapPinX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";

export default function NotFound() {
	return (
		<div className="relative grid min-h-[70vh] place-items-center p-6">
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
					opacity: 0.6,
					mixBlendMode: "multiply",
				}}
			/>
			<div className="relative z-10 w-full max-w-xl space-y-6 rounded-base border-2 border-border bg-card p-8 text-center shadow-shadow">
				<div className="mx-auto flex size-16 items-center justify-center rounded-base border-2 border-border bg-yellow-200 text-yellow-900">
					<MapPinX className="h-8 w-8" />
				</div>
				<Text as="h1">404 - Хуудас олдсонгүй</Text>
				<Text className="text-muted-foreground">Та зөв хаяг оруулсан эсэхээ шалгана уу.</Text>
				<div className="flex items-center justify-center gap-2">
					<Link to="/">
						<Button>
							<Home className="mr-2 h-4 w-4" />
							Нүүр хуудас руу очих
						</Button>
					</Link>
				</div>
			</div>
		</div>
	);
}



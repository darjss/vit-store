import { DangerTriangleIcon } from "@solar-icons/solid/linear/danger-triangle";
import { Link } from "@tanstack/solid-router";

import { Button, EmptyState } from "@vit/ui";

export function AppNotFound() {
	return (
		<div class="flex min-h-dvh w-full items-center justify-center px-4">
			<EmptyState
				class="w-full max-w-md"
				icon={<DangerTriangleIcon />}
				title="Хуудас олдсонгүй"
				description="Энэ хаяг байхгүй эсвэл зөөгдсөн байна. Нүүр хуудаснаас үргэлжлүүлээрэй."
				action={
					<Button as={Link} to="/">
						Нүүр рүү буцах
					</Button>
				}
			/>
		</div>
	);
}

import { Button, InlineAlert } from "@/tmp-ui";

// Root error boundary: recovery path via reset().
export function AppError(props: { error: Error; reset: () => void }) {
	return (
		<div class="flex min-h-dvh w-full items-center justify-center px-4">
			<div class="flex w-full max-w-md flex-col items-start gap-4">
				<InlineAlert variant="error" class="w-full">
					{props.error.message || "Уучлаарай, ямар нэг зүйл буруу боллоо."}
				</InlineAlert>
				<Button onClick={() => props.reset()}>Дахин оролдох</Button>
			</div>
		</div>
	);
}

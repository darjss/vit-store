import { createSignal } from "solid-js";
import { cn } from "@/lib/utils";
import { CopyIcon as IconFileCopy } from "@solar-icons/solid/linear";
import { CheckCircleIcon as IconCheck } from "@solar-icons/solid/bold";

interface CopyFieldButtonProps {
	text: string | number;
	label: string;
	class?: string;
}

const stateClass =
	"col-start-1 row-start-1 flex items-center justify-center transition-[opacity,filter] duration-200 ease-out";

const CopyFieldButton = (props: CopyFieldButtonProps) => {
	const [copied, setCopied] = createSignal(false);
	let timer: number | undefined;

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(String(props.text));
			setCopied(true);
			window.clearTimeout(timer);
			timer = window.setTimeout(() => setCopied(false), 1600);
		} catch (err) {
			console.error("Failed to copy text:", err);
		}
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			aria-label={`${props.label} хуулах`}
			class={cn(
				"flex w-11 shrink-0 items-center justify-center rounded-r-xl border border-border border-l-0 bg-primary text-primary-foreground transition-[background-color,transform] duration-[140ms] ease-out active:scale-[0.97]",
				copied() && "bg-success text-success-foreground",
				props.class,
			)}
		>
			<span class="grid place-items-center">
				<span
					class={cn(stateClass, copied() && "opacity-0 blur-[2px]")}
					aria-hidden={copied()}
				>
					<IconFileCopy class="h-4.5 w-4.5" />
				</span>
				<span
					class={cn(stateClass, !copied() && "opacity-0 blur-[2px]")}
					aria-hidden={!copied()}
				>
					<IconCheck class="h-4.5 w-4.5" />
				</span>
			</span>
		</button>
	);
};

export default CopyFieldButton;

import { createSignal, Show } from "solid-js";
import { showToast } from "@/components/ui/toast";
import { CopyIcon as IconFileCopy } from "@solar-icons/solid/linear";
import { CheckCircleIcon as IconCheck } from "@solar-icons/solid/bold";

interface CopyButtonProps {
  text: string | number ,
  title:string
  class?: string;
}

const CopyButton = (props: CopyButtonProps) => {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    const textString = String(props.text);
    try {
      await navigator.clipboard.writeText(textString);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
      showToast({
        title: `${props.title} амжилттай хуулсан`,
        description: `${props.text} текст амжилттай хуулсан`,
        duration: 500,
        variant: "success",
      });  
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };
  return (
    <button
      onClick={handleCopy}
      class={`p-2 sm:p-3 md:p-4 bg-[hsl(var(--primary))] border border-l-0 border-border rounded-r-md hover:bg-[hsl(var(--primary))] transition-[transform] duration-150 ease-out active:scale-[0.97] ${props.class || ""}`}
    >
      <Show when={copied()} fallback={<IconFileCopy class="w-[18px] h-[18px] md:w-6 md:h-6" />}>
        <IconCheck class="w-[18px] h-[18px] md:w-6 md:h-6" />
      </Show>
    </button>
  );
};

export default CopyButton;

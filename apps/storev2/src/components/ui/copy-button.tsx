import { createSignal, Show } from "solid-js";
import { showToast } from "@/components/ui/toast";

interface CopyButtonProps {
  text: string | number ,
  title:string
  class?: string;
}

const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="md:w-6 md:h-6"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="md:w-6 md:h-6"
  >
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

const CopyButton = (props: CopyButtonProps) => {
  const [copied, setCopied] = createSignal(false);

  const handleCopy = async () => {
    const textString = String(props.text);
    console.log("textString copying ", textString);
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
      class={`p-2 sm:p-3 md:p-4 bg-[hsl(var(--primary))] border-2 border-l-0 border-black rounded-r-md hover:bg-[hsl(var(--primary))] transition-all ${props.class || ""}`}
    >
      <Show when={copied()} fallback={<CopyIcon />}>
        <CheckIcon />
      </Show>
    </button>
  );
};

export default CopyButton;

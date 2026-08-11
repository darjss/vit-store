import { UploadIcon } from "@solar-icons/solid/linear/upload";
import { Button, showToast } from "@vit/ui";
import { createSignal } from "solid-js";

import { uploadProductImage } from "../upload";

interface UploadButtonProps {
	onUploaded: (url: string) => void;
}

/**
 * Image upload boundary — POSTs to /upload/products (legacy mechanism) and
 * hands the returned CDN url to the form.
 */
export function UploadButton(props: UploadButtonProps) {
	const [pending, setPending] = createSignal(false);
	let fileInput: HTMLInputElement | undefined;

	const handleFiles = async (files: FileList | null) => {
		if (!files || files.length === 0) return;
		setPending(true);
		try {
			for (const file of Array.from(files)) {
				try {
					const url = await uploadProductImage(file);
					props.onUploaded(url);
				} catch (error) {
					showToast({
						title: "Зураг оруулах боломжгүй",
						description:
							error instanceof Error ? error.message : "Алдаа гарлаа",
						variant: "error",
					});
				}
			}
		} finally {
			setPending(false);
			if (fileInput) fileInput.value = "";
		}
	};

	return (
		<>
			<input
				ref={fileInput}
				type="file"
				accept="image/*"
				multiple
				class="hidden"
				tabindex="-1"
				onChange={(event) => void handleFiles(event.currentTarget.files)}
			/>
			<Button
				type="button"
				variant="secondary"
				loading={pending()}
				onClick={() => fileInput?.click()}
			>
				<UploadIcon />
				Зураг оруулах
			</Button>
		</>
	);
}

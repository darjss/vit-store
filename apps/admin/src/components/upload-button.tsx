import { useMutation } from "@tanstack/react-query";
import type { ImageUrlArray } from "@vit/shared";
import { nanoid } from "nanoid";
import { useRef } from "react";
import { toast } from "sonner";
import { UploadIcon } from "./icons";
import SubmitButton from "./submit-button";
import { Input } from "./ui/input";

const deriveExtension = (image: File): string => {
	const mimeSub = image.type.split("/")[1];
	if (mimeSub) {
		return mimeSub;
	}
	const nameMatch = image.name.match(/\.([a-zA-Z0-9]+)$/);
	if (nameMatch) {
		return nameMatch[1].toLowerCase();
	}
	return "jpg";
};

const uploadImage = async (image: File, category: string) => {
	const key = `${category}/${nanoid()}.${deriveExtension(image)}`;
	const formData = new FormData();
	formData.append("image", image);
	formData.append("key", key);
	const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/upload/${category}s`, {
		method: "POST",
		body: formData,
	});
	const data = (await response.json()) as { url?: string; message: string };
	if (response.ok && data.url) {
		return data.url;
	}
	throw new Error(data.message || `Upload failed (${response.status})`);
};

export const UploadButton = ({
	append,
	category,
	onSuccess,
}: {
	append?: (value: ImageUrlArray[number]) => void;
	category: string;
	onSuccess: (url: string) => void;
}) => {
	const fileRef = useRef<HTMLInputElement>(null);
	const { mutate: upload, isPending } = useMutation({
		mutationFn: ({ image, category }: { image: File; category: string }) => {
			return uploadImage(image, category);
		},
		mutationKey: ["upload"],
	});
	const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (!files || files.length === 0) {
			return;
		}

		Array.from(files).forEach((file) => {
			upload(
				{ image: file, category },
				{
					onSuccess: (url) => {
						append?.({ url });
						onSuccess(url);
					},
					onError: (error) => {
						toast.error(error.message || "Зураг оруулахад алдаа гарлаа");
					},
				},
			);
		});
		// Reset input so re-selecting the same file fires onChange again
		e.target.value = "";
	};
	return (
		<div>
			<SubmitButton
				type="button"
				isPending={isPending}
				onClick={() => {
					fileRef.current?.click();
				}}
				className="flex items-center gap-2"
			>
				<Input
					type="file"
					className="hidden"
					ref={fileRef}
					onChange={handleFileChange}
					accept="image/*"
					multiple // enable multiple selection
				/>
				<UploadIcon className="h-4 w-4" />
				Оруулах
			</SubmitButton>
		</div>
	);
};

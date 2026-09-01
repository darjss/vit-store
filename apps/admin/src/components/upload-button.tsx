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
		body: formData,
		credentials: "include",
		method: "POST",
	});
	const data = (await response.json()) as { message: string; url?: string };
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
	const { isPending, mutate: upload } = useMutation({
		mutationFn: ({ category, image }: { category: string; image: File }) => {
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
				{ category, image: file },
				{
					onError: (error) => {
						toast.error(error.message || "Зураг оруулахад алдаа гарлаа");
					},
					onSuccess: (url) => {
						append?.({ url });
						onSuccess(url);
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
				className="flex items-center gap-2"
				isPending={isPending}
				onClick={() => {
					fileRef.current?.click();
				}}
				type="button"
			>
				<Input
					accept="image/*"
					className="hidden"
					multiple // enable multiple selection
					onChange={handleFileChange}
					ref={fileRef}
					type="file"
				/>
				<UploadIcon className="h-4 w-4" />
				Оруулах
			</SubmitButton>
		</div>
	);
};

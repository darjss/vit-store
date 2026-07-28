import { useMutation } from "@tanstack/react-query";
import type { ImageUrlArray } from "@vit/shared";
import { nanoid } from "nanoid";
import { useRef } from "react";
import { toast } from "sonner";
import { UploadIcon } from "./icons";
import SubmitButton from "./submit-button";
import { Input } from "./ui/input";

const deriveExtension = (image: File) => {
	const mimeSub = image.type.split("/")[1];
	if (mimeSub) return mimeSub;
	const nameMatch = image.name.match(/\.([a-zA-Z0-9]+)$/);
	return nameMatch?.[1]?.toLowerCase() ?? "jpg";
};

const uploadImage = async (image: File, category: string) => {
	const key = `${category}/${nanoid()}.${deriveExtension(image)}`;
	const formData = new FormData();
	formData.append("image", image);
	formData.append("key", key);
	const response = await fetch(
		`${import.meta.env.VITE_SERVER_URL}/upload/${category}s`,
		{
			method: "POST",
			credentials: "include",
			body: formData,
		},
	);
	const data: unknown = await response.json();
	if (
		response.ok &&
		data !== null &&
		typeof data === "object" &&
		"url" in data &&
		typeof data.url === "string"
	) {
		return data.url;
	}
	throw new Error("Image upload failed");
};

const uploadImages = async (images: File[], category: string) => {
	const settled = await Promise.allSettled(
		images.map((image) => uploadImage(image, category)),
	);
	return {
		urls: settled.flatMap((result) =>
			result.status === "fulfilled" ? [result.value] : [],
		),
		failed: settled.filter((result) => result.status === "rejected").length,
		total: images.length,
	};
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
		mutationFn: (images: File[]) => uploadImages(images, category),
		mutationKey: ["upload", category],
		onSuccess: ({ urls, failed, total }) => {
			for (const url of urls) {
				append?.({ url });
				onSuccess(url);
			}
			if (failed > 0) {
				toast.warning(
					`${total}-с ${urls.length} зураг орлоо. ${failed} зургийг оруулж чадсангүй.`,
				);
			}
		},
	});
	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (files?.length) upload(Array.from(files));
		event.target.value = "";
	};
	return (
		<div>
			<SubmitButton
				type="button"
				isPending={isPending}
				onClick={() => fileRef.current?.click()}
				className="flex items-center gap-2"
			>
				<Input
					type="file"
					className="hidden"
					ref={fileRef}
					onChange={handleFileChange}
					accept="image/*"
					multiple
				/>
				<UploadIcon className="h-4 w-4" />
				Оруулах
			</SubmitButton>
		</div>
	);
};

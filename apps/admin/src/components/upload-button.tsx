import { useMutation } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { useRef } from "react";
import type { UseFieldArrayAppend, UseFormSetValue } from "react-hook-form";
import { UploadIcon } from "./icons";
import SubmitButton from "./submit-button";
import { Input } from "./ui/input";

const uploadImage = async (image: File, category: string) => {
	try {
		const key = `${category}/${nanoid()}.${image.type.split("/")[1]}`;
		const formData = new FormData();
		formData.append("image", image);
		formData.append("key", key);
		const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/upload`, {
			method: "POST",
			body: formData,
		});
		const data = (await response.json()) as { url?: string; message: string };
		if (response.status === 200 && data.url) {
			return data.url;
		}
		throw new Error(data.message || "Failed to upload image");
	} catch (error) {
		console.error(error);
		throw new Error("Failed to upload image");
	}
};

export const UploadButton = ({
	append,
	setValue,
	category,
	onSuccess,
}: {
	append?: UseFieldArrayAppend<any, "images">;
	setValue?: UseFormSetValue<any>;
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
			throw new Error("Select a file");
		}
		// Allow multiple files
		Array.from(files).forEach((file) => {
			upload(
				{ image: file, category },
				{
					onSuccess: (url) => {
						console.log("image uploaded successfully", url);
						append?.({ url });
						// If you still need a single imageUrl, the last one wins
						setValue?.("imageUrl", url);
						onSuccess(url);
					},
					onError: (error) => {
						console.error(error);
					},
				},
			);
		});
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
				Upload
			</SubmitButton>
		</div>
	);
};

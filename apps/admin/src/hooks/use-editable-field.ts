import { useState } from "react";

export type UseEditableOptions<T> = {
	initialValue: T;
	onSave: (next: T) => void | Promise<void>;
};

export function useEditableField<T>({
	initialValue,
	onSave,
}: UseEditableOptions<T>) {
	const [isEditing, setIsEditing] = useState(false);
	const [tempValue, setTempValue] = useState<T>(initialValue);

	const start = (value: T) => {
		setTempValue(value);
		setIsEditing(true);
	};

	const cancel = () => {
		setIsEditing(false);
	};

	const save = async () => {
		await onSave(tempValue);
		setIsEditing(false);
	};

	return { isEditing, tempValue, setTempValue, start, cancel, save } as const;
}



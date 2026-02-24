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
	const [isSaving, setIsSaving] = useState(false);
	const [tempValue, setTempValue] = useState<T>(initialValue);

	const start = (value: T) => {
		setTempValue(value);
		setIsEditing(true);
	};

	const cancel = () => {
		if (isSaving) return;
		setIsEditing(false);
	};

	const save = async () => {
		setIsSaving(true);
		try {
			await onSave(tempValue);
			setIsEditing(false);
		} finally {
			setIsSaving(false);
		}
	};

	return {
		isEditing,
		isSaving,
		tempValue,
		setTempValue,
		start,
		cancel,
		save,
	} as const;
}

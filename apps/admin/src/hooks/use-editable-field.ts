import { useState } from "react";

type UseEditableOptions<T> = {
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
		if (isSaving) return;
		setIsSaving(true);
		try {
			await onSave(tempValue);
			setIsEditing(false);
		} catch (_error) {
			// Keep editing on error so the user can retry/adjust.
			// The caller's mutation onError is responsible for surfacing the toast.
			setIsSaving(false);
			return;
		}
		setIsSaving(false);
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

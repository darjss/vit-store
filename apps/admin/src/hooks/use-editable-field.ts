import { useState } from "react";

type UseEditableOptions<T> = {
	initialValue: T;
	// Mutations resolve with their response object; the field only waits for it.
	onSave: (next: T) => Promise<object | void> | void;
};

export function useEditableField<T>({ initialValue, onSave }: UseEditableOptions<T>) {
	const [isEditing, setIsEditing] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [tempValue, setTempValue] = useState<T>(initialValue);

	const start = (value: T) => {
		setTempValue(value);
		setIsEditing(true);
	};

	const cancel = () => {
		if (isSaving) {
			return;
		}
		setIsEditing(false);
	};

	const save = async () => {
		if (isSaving) {
			return;
		}
		setIsSaving(true);
		try {
			await onSave(tempValue);
			setIsEditing(false);
		} catch {
			// Keep editing on error so the user can retry/adjust.
			// The caller's mutation onError is responsible for surfacing the toast.
			setIsSaving(false);
			return;
		}
		setIsSaving(false);
	};

	return {
		cancel,
		isEditing,
		isSaving,
		save,
		setTempValue,
		start,
		tempValue,
	} as const;
}

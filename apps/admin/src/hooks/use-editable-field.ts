import { useState } from "react";

type UseEditableOptions<T> = {
	initialValue: T;
	onSave: (next: T) => boolean | void | Promise<boolean | void>;
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
			const saved = await onSave(tempValue);
			if (saved !== false) setIsEditing(false);
		} catch {
			// Transport failures stay in TanStack's error path. Keep the editor open.
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

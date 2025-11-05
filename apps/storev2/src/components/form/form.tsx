import { createFormHook } from "@tanstack/solid-form";
import type { ComponentProps } from "solid-js";
import { lazy } from "solid-js";
import { Button } from "../ui/button";
import {
	fieldContext,
	formContext,
	useFieldContext,
	useFormContext,
} from "./form-context";

const FormTextField = lazy(() =>
	import("./form-text-field").then((f) => ({ default: f.FormTextField })),
);
const FormTextArea = lazy(() =>
	import("./form-text-area-field").then((f) => ({ default: f.FormTextArea })),
);
function SubmitButton(props: {
	children?: string;
	disabled?: boolean;
	type?: ComponentProps<typeof Button>["type"];
}) {
	const form = useFormContext();
	return (
		<form.Subscribe
			selector={(state) => ({
				isSubmitting: state.isSubmitting,
				canSubmit: state.canSubmit,
			})}
		>
			{(state) => (
				<Button
					type={props.type || "submit"}
					disabled={props.disabled || !state().canSubmit}
				>
					{state().isSubmitting ? "..." : props.children || "Submit"}
				</Button>
			)}
		</form.Subscribe>
	);
}

export const { useAppForm, withForm } = createFormHook({
	fieldComponents: {
		FormTextField,
		FormTextArea,
	},
	formComponents: {
		SubmitButton,
	},
	fieldContext,
	formContext,
});

export { useFieldContext, useFormContext };

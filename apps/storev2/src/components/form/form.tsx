import { createFormHook } from "@tanstack/solid-form";
import type { ComponentProps, JSX } from "solid-js";
import { lazy } from "solid-js";
import { Button } from "../ui/button";
import { fieldContext, formContext, useFormContext } from "./form-context";

const FormTextField = lazy(() =>
	import("./form-text-field").then((f) => ({ default: f.FormTextField })),
);
const FormTextArea = lazy(() =>
	import("./form-text-area-field").then((f) => ({ default: f.FormTextArea })),
);
const FormSelectField = lazy(() =>
	import("./form-select-field").then((f) => ({ default: f.FormSelectField })),
);
function SubmitButton(props: {
	children?: JSX.Element;
	loadingContent?: JSX.Element;
	disabled?: boolean;
	type?: ComponentProps<typeof Button>["type"];
	size?: ComponentProps<typeof Button>["size"];
	class?: string;
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
					size={props.size}
					class={props.class}
				>
					{state().isSubmitting
						? (props.loadingContent ?? "...")
						: (props.children ?? "Submit")}
				</Button>
			)}
		</form.Subscribe>
	);
}

const { useAppForm } = createFormHook({
	fieldComponents: {
		FormTextField,
		FormTextArea,
		FormSelectField,
	},
	formComponents: {
		SubmitButton,
	},
	fieldContext,
	formContext,
});

export { useAppForm };

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
	class?: string;
	disabled?: boolean;
	loadingContent?: JSX.Element;
	size?: ComponentProps<typeof Button>["size"];
	type?: ComponentProps<typeof Button>["type"];
}) {
	const form = useFormContext();
	return (
		<form.Subscribe
			selector={(state) => ({
				canSubmit: state.canSubmit,
				isSubmitting: state.isSubmitting,
			})}
		>
			{(state) => (
				<Button
					class={props.class}
					disabled={props.disabled || !state().canSubmit}
					size={props.size}
					type={props.type || "submit"}
				>
					{state().isSubmitting ? (props.loadingContent ?? "...") : (props.children ?? "Submit")}
				</Button>
			)}
		</form.Subscribe>
	);
}

const { useAppForm } = createFormHook({
	fieldComponents: {
		FormSelectField,
		FormTextArea,
		FormTextField,
	},
	fieldContext,
	formComponents: {
		SubmitButton,
	},
	formContext,
});

export { useAppForm };

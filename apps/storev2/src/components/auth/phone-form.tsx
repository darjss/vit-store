import { useMutation } from "@tanstack/solid-query";
import * as v from "valibot";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { InfoCircleIcon as IconInformation } from "@solar-icons/solid/linear";
import { useAppForm } from "../form/form";
import { showToast } from "../ui/toast";

const PhoneForm = (props: {
	setPhone: (phone: string) => void;
	setStep: (step: "phone" | "otp") => void;
}) => {
	const mutation = useMutation(
		() => ({
			mutationFn: async (phone: string) => {
				return await api.auth.sendOtp.mutate({ phone });
			},

			onSuccess: async () => {
				props.setStep("otp");
				showToast({
					description: "Таны утсанд баталгаажуулах код илгээгдлээ",
					duration: 5000,
					title: "Амжилттай",
					variant: "success",
				});
			},
		}),
		() => queryClient,
	);

	const form = useAppForm(() => ({
		defaultValues: {
			phone: "",
		},
		onSubmit: async (values) => {
			props.setPhone(values.value.phone);
			mutation.mutate(values.value.phone);
		},
		validators: {
			onChange: v.object({
				phone: v.pipe(
					v.string(),
					v.minLength(8, "Phone number must be 8 digits"),
					v.maxLength(8, "Phone number must be 8 digits"),
					v.regex(/^[6-9]\d{7}$/, "Phone number must start with 6-9"),
				),
			}),
		},
	}));

	return (
		<div class="space-y-6">
			<div class="bg-info/60 rounded-xl p-4">
				<div class="flex items-start gap-3">
					<div class="text-info-foreground mt-0.5 flex-shrink-0">
						<IconInformation class="h-5 w-5" />
					</div>
					<p class="text-info-foreground flex-1 text-xs leading-relaxed font-medium md:text-sm">
						Таны утасны дугаарт баталгаажуулах код илгээгдэх болно
					</p>
				</div>
			</div>

			<form
				class="space-y-6"
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					// Blur active input to dismiss mobile keyboard
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
					form.handleSubmit();
				}}
			>
				<form.AppField
					children={(field) => (
						<field.FormTextField label="Утасны дугаар" placeholder="88889999" type="tel" />
					)}
					name="phone"
				/>

				<form.AppForm>
					<form.SubmitButton>
						{mutation.isPending ? "Илгээж байна..." : "Код авах"}
					</form.SubmitButton>
				</form.AppForm>
			</form>
		</div>
	);
};
export default PhoneForm;

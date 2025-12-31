import { useMutation } from "@tanstack/solid-query";
import * as v from "valibot";
import { queryClient } from "@/lib/query";
import { api } from "@/lib/trpc";
import { useAppForm } from "../form/form";
import { showToast } from "../ui/toast";
import IconInformation from "~icons/ri/information-line";

const PhoneForm = ({
	setStep,
	setPhone,
}: {
	setStep: (step: "phone" | "otp") => void;
	setPhone: (phone: string) => void;
}) => {
	const mutation = useMutation(
		() => ({
			mutationFn: async (phone: string) => {
				return await api.auth.sendOtp.mutate({ phone: phone });
			},

			onSuccess: async () => {
				console.log("Form submitted ");
				setStep("otp");
				showToast({
					title: "Амжилттай",
					description: "Таны утсанд баталгаажуулах код илгээгдлээ",
					variant: "success",
					duration: 5000,
				});
			},
		}),
		() => queryClient,
	);

	const form = useAppForm(() => ({
		defaultValues: {
			phone: "",
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
		onSubmit: async (values) => {
			setPhone(values.value.phone);
			mutation.mutate(values.value.phone);
		},
	}));

	return (
		<div class="space-y-6">
			<div class="border-3 border-black bg-muted/50 p-4 shadow-[4px_4px_0_0_#000]">
				<div class="flex items-start gap-3">
					<div class="mt-1 flex-shrink-0">
						<IconInformation class="h-5 w-5 md:h-6 md:w-6" />
					</div>
					<div class="flex-1">
						<p class="font-bold text-xs leading-relaxed md:text-sm">
							Таны утасны дугаарт баталгаажуулах код илгээгдэх болно
						</p>
					</div>
				</div>
			</div>

			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					// Blur active input to dismiss mobile keyboard
					if (document.activeElement instanceof HTMLElement) {
						document.activeElement.blur();
					}
					form.handleSubmit();
				}}
				class="space-y-6"
			>
				<form.AppField
					name="phone"
					children={(field) => (
						<field.FormTextField
							label="Утасны дугаар"
							placeholder="88889999"
							type="tel"
						/>
					)}
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

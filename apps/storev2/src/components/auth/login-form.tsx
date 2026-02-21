import { makePersisted } from "@solid-primitives/storage";
import { createSignal, Match, onMount, Switch } from "solid-js";
import { Card, CardContent } from "../ui/card";
import OtpForm from "./otp-form";
import PhoneForm from "./phone-form";

// Key for storing the timestamp when OTP step was entered
const OTP_TIMESTAMP_KEY = "login-otp-timestamp";
// OTP expires after 5 minutes (in milliseconds)
const OTP_EXPIRY_MS = 5 * 60 * 1000;

const LoginForm = () => {
	const [phone, setPhone] = makePersisted(createSignal(""), {
		name: "login-phone",
		storage: localStorage,
		deferInit: true,
	});
	const [step, setStepRaw] = makePersisted(
		createSignal<"phone" | "otp">("phone"),
		{
			name: "login-step",
			storage: localStorage,
			deferInit: true,
		},
	);

	// Wrapper to also track timestamp when entering OTP step
	const setStep = (newStep: "phone" | "otp") => {
		if (newStep === "otp") {
			localStorage.setItem(OTP_TIMESTAMP_KEY, Date.now().toString());
		} else {
			localStorage.removeItem(OTP_TIMESTAMP_KEY);
		}
		setStepRaw(newStep);
	};

	onMount(() => {
		const currentStep = step();
		if (currentStep === "otp") {
			const timestamp = localStorage.getItem(OTP_TIMESTAMP_KEY);
			if (timestamp) {
				const elapsed = Date.now() - Number.parseInt(timestamp, 10);
				if (elapsed > OTP_EXPIRY_MS) {
					// OTP has expired, reset to phone step
					setStep("phone");
				}
			} else {
				setStep("phone");
			}
		}
	});

	return (
		<div class="flex min-h-[80vh] w-full items-center justify-center px-4 py-8 md:py-12">
			<div class="w-full max-w-md">
				{/* Header Section */}
				<div class="mb-6 text-center md:mb-8">
					<div class="mb-4 inline-block rotate-[-2deg] border-4 border-black bg-primary px-4 py-2 shadow-[6px_6px_0_0_#000]">
						<h1 class="font-black text-2xl uppercase md:text-3xl">
							{step() === "phone" ? "Нэвтрэх" : "Баталгаажуулалт"}
						</h1>
					</div>
					<p class="font-medium text-muted-foreground text-sm md:text-base">
						{step() === "phone"
							? "Таны аюулгүй нэвтрэлт"
							: `Код илгээгдсэн: ${phone()}`}
					</p>
				</div>

				{/* Card */}
				<Card class="bg-card">
					<CardContent class="p-6 md:p-8">
						<Switch>
							<Match when={step() === "phone"}>
								<PhoneForm setStep={setStep} setPhone={setPhone} />
							</Match>
							<Match when={step() === "otp"}>
								<OtpForm phone={phone()} setStep={setStep} />
							</Match>
						</Switch>
					</CardContent>
				</Card>

				{/* Footer Info */}
				<div class="mt-6 text-center">
					<p class="text-muted-foreground text-xs md:text-sm">
						Нэвтрэх товчийг дарснаар та манай{" "}
						<span class="font-black text-foreground underline decoration-2 underline-offset-4">
							үйлчилгээний нөхцөл
						</span>
						-тэй зөвшөөрч байна
					</p>
				</div>
			</div>
		</div>
	);
};

export default LoginForm;

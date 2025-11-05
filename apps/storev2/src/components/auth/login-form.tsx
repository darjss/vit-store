import { makePersisted } from "@solid-primitives/storage";
import { createEffect, createSignal, Match, Switch } from "solid-js";
import { Card, CardContent } from "../ui/card";
import OtpForm from "./otp-form";
import PhoneForm from "./phone-form";

const LoginForm = () => {
	const [phone, setPhone] = makePersisted(createSignal(""), {
		name: "login-phone",
		storage: localStorage,
		deferInit: true,
	});
	const [step, setStep] = makePersisted(
		createSignal<"phone" | "otp">("phone"),
		{
			name: "login-step",
			storage: localStorage,
			deferInit: true,
		},
	);
	createEffect(() => {
		console.log(step());
	}, [step()]);

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

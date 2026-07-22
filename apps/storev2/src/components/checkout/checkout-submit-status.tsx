import IconCar from "~icons/ri/car-line";

const CheckoutSubmitStatus = () => (
	<span class="flex items-center justify-center gap-3" aria-live="polite">
		<span
			class="relative grid size-9 shrink-0 place-items-center"
			aria-hidden="true"
		>
			<svg class="absolute inset-0 size-9" viewBox="0 0 36 36">
				<title>Захиалга бэлдэж байна</title>
				<circle
					cx="18"
					cy="18"
					r="14"
					fill="none"
					stroke="currentColor"
					stroke-opacity="0.18"
					stroke-width="2.5"
				/>
				<path
					class="checkout-loader-ring"
					d="M18 4a14 14 0 0 1 14 14"
					fill="none"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-width="3"
				/>
				<path
					class="checkout-loader-ring-slow"
					d="M18 9a9 9 0 0 0-9 9"
					fill="none"
					stroke="currentColor"
					stroke-linecap="round"
					stroke-width="2"
				/>
			</svg>
			<IconCar class="size-4 animate-checkout-car" />
		</span>
		<span class="text-left leading-tight">
			<span class="block text-sm sm:text-base">Захиалга бэлдэж байна</span>
			<span class="mt-1 flex gap-1" aria-hidden="true">
				<i class="checkout-loader-dot size-1.5 rounded-full bg-current" />
				<i class="checkout-loader-dot size-1.5 rounded-full bg-current" />
				<i class="checkout-loader-dot size-1.5 rounded-full bg-current" />
			</span>
		</span>
	</span>
);

export default CheckoutSubmitStatus;

import { createSignal, onMount } from "solid-js";
import IconArrowLeft from "~icons/ri/arrow-left-s-line";
import IconArrowRight from "~icons/ri/arrow-right-s-line";

interface CarouselItem {
	id: number;
	content: any;
}

interface Props {
	items: CarouselItem[];
	autoplay?: boolean;
	interval?: number;
}

export default function ProductCarousel(props: Props) {
	const [currentIndex, setCurrentIndex] = createSignal(0);
	const [isHovered, setIsHovered] = createSignal(false);

	const itemsPerView = () => {
		if (typeof window !== "undefined") {
			if (window.innerWidth >= 1024) return 4; // lg
			if (window.innerWidth >= 640) return 2; // sm
		}
		return 1;
	};

	const totalSlides = () => Math.ceil(props.items.length / itemsPerView());

	const nextSlide = () => {
		setCurrentIndex((prev) => (prev + 1) % totalSlides());
	};

	const prevSlide = () => {
		setCurrentIndex((prev) => (prev - 1 + totalSlides()) % totalSlides());
	};

	const goToSlide = (index: number) => {
		setCurrentIndex(index);
	};

	onMount(() => {
		if (props.autoplay) {
			const timer = setInterval(() => {
				if (!isHovered()) {
					nextSlide();
				}
			}, props.interval || 5000);

			return () => clearInterval(timer);
		}
	});

	return (
		<div
			class="relative w-full"
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
		>
			{/* Carousel Container */}
			<div class="overflow-hidden">
				<div
					class="flex transition-transform duration-500 ease-out"
					style={{
						transform: `translateX(-${currentIndex() * 100}%)`,
					}}
				>
					{props.items.map((item) => (
						<div
							class="w-full shrink-0 px-2 sm:px-3"
							style={{
								"flex-basis": `${100 / itemsPerView()}%`,
							}}
						>
							{item.content}
						</div>
					))}
				</div>
			</div>

			{/* Navigation Buttons */}
			{totalSlides() > 1 && (
				<>
					<button
						type="button"
						onClick={prevSlide}
						class="-translate-y-1/2 -translate-x-4 sm:-translate-x-6 absolute top-1/2 left-0 z-10 flex size-10 items-center justify-center rounded-full border-3 border-black bg-white font-black text-xl shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[-14px] hover:translate-y-[-50%] hover:shadow-[2px_2px_0_0_#000] active:scale-95 sm:size-12 sm:hover:translate-x-[-22px]"
					>
						<IconArrowLeft class="h-6 w-6" />
					</button>
					<button
						type="button"
						onClick={nextSlide}
						class="-translate-y-1/2 absolute top-1/2 right-0 z-10 flex size-10 translate-x-4 items-center justify-center rounded-full border-3 border-black bg-white font-black text-xl shadow-[4px_4px_0_0_#000] transition-all hover:translate-x-[14px] hover:translate-y-[-50%] hover:shadow-[2px_2px_0_0_#000] active:scale-95 sm:size-12 sm:translate-x-6 sm:hover:translate-x-[22px]"
					>
						<IconArrowRight class="h-6 w-6" />
					</button>
				</>
			)}

			{/* Dot Indicators */}
			{totalSlides() > 1 && (
				<div class="mt-6 flex justify-center gap-2">
					{Array.from({ length: totalSlides() }).map((_, index) => (
						<button
							type="button"
							onClick={() => goToSlide(index)}
							class={`size-3 rounded-full border-2 border-black transition-all sm:size-4 ${
								currentIndex() === index
									? "bg-black shadow-[2px_2px_0_0_#000]"
									: "bg-white hover:bg-black/20"
							}`}
							aria-label={`Слайд ${index + 1} руу шилжих`}
						/>
					))}
				</div>
			)}
		</div>
	);
}

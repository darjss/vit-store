import { TextShimmer } from "./motion/text-shimmer";

const Loader = () => {
	return (
		<div className="fixed inset-0 flex items-center justify-center bg-background/95 backdrop-blur-sm transition-all duration-500">
			<div className="relative flex flex-col items-center">
				<div className="relative">
					<div className="h-24 w-24 animate-[spin_3s_linear_infinite] rounded-full border-2 border-border/20" />
					<div className="absolute inset-1 h-22 w-22 animate-[spin_2s_linear_infinite_reverse] rounded-full border-2 border-main/30" />
					<div className="absolute inset-2 h-20 w-20 animate-[spin_1.5s_linear_infinite] rounded-full border-main border-t-3 border-r-3 shadow-lg" />

					{/* Pulsing center core */}
					<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
						<div className="h-12 w-12 animate-[pulse_2s_ease-in-out_infinite] rounded-full bg-gradient-to-br from-main via-main/80 to-main/60 shadow-[0_0_20px_rgba(0,0,0,0.1)] dark:shadow-[0_0_20px_rgba(255,255,255,0.1)]" />

						{/* Inner glow */}
						<div className="absolute inset-2 h-8 w-8 animate-[pulse_1.5s_ease-in-out_infinite_0.5s] rounded-full bg-gradient-to-br from-main/40 to-transparent" />
					</div>

					{/* Orbiting dots */}
					<div className="absolute inset-0 h-24 w-24 animate-[spin_4s_linear_infinite]">
						<div className="-top-1 -translate-x-1/2 absolute left-1/2 h-2 w-2 rounded-full bg-main/60" />
					</div>
					<div className="absolute inset-0 h-24 w-24 animate-[spin_4s_linear_infinite_reverse] delay-1000">
						<div className="-bottom-1 -translate-x-1/2 absolute left-1/2 h-2 w-2 rounded-full bg-main/40" />
					</div>
				</div>

				{/* Loading text with shimmer effect */}
				<div className="mt-12 flex flex-col items-center gap-3">
					<TextShimmer
						duration={1.5}
						spread={3}
						className="font-semibold text-xl [--base-color:var(--foreground)] [--base-gradient-color:var(--main)] dark:[--base-color:var(--foreground)] dark:[--base-gradient-color:var(--main)]"
					>
						Loading
					</TextShimmer>

					{/* Subtitle with subtle animation */}
					<div className="flex items-center gap-1">
						<span className="animate-[bounce_1.5s_infinite] text-foreground/60 text-sm delay-0">
							•
						</span>
						<span className="animate-[bounce_1.5s_infinite] text-foreground/60 text-sm delay-200">
							•
						</span>
						<span className="animate-[bounce_1.5s_infinite] text-foreground/60 text-sm delay-400">
							•
						</span>
					</div>
				</div>

				{/* Background glow effect */}
				<div className="-z-10 absolute inset-0 opacity-20">
					<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-32 w-32 animate-[pulse_3s_ease-in-out_infinite] rounded-full bg-gradient-radial from-main/30 via-main/10 to-transparent blur-xl" />
				</div>
			</div>
		</div>
	);
};

export default Loader;

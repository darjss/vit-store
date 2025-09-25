const Loader = () => {
	return (
		<div className="fixed inset-0 flex items-center justify-center backdrop-blur-md transition-all duration-500">
			<div className="relative flex flex-col items-center">
				<div className="relative">
					{/* Outer spinning ring */}
					<div className="h-28 w-28 animate-[spin_4s_linear_infinite] rounded-full border-4 border-primary/20" />

					{/* Middle spinning ring */}
					<div className="absolute inset-2 h-24 w-24 animate-[spin_3s_linear_infinite_reverse] rounded-full border-3 border-primary/40" />

					{/* Inner spinning ring with gradient border */}
					<div className="absolute inset-4 h-20 w-20 animate-[spin_2s_linear_infinite] rounded-full border-2 border-primary border-t-primary/60 border-r-primary/60 shadow-md" />

					{/* Central pulsing core */}
					<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2">
						<div className="h-14 w-14 animate-[pulse_2s_ease-in-out_infinite] rounded-full bg-gradient-to-br from-primary via-primary-hover to-primary shadow-lg" />
						<div className="absolute inset-2 h-10 w-10 animate-[pulse_1.5s_ease-in-out_infinite_0.5s] rounded-full bg-gradient-to-br from-accent/30 to-transparent" />
					</div>

					{/* Orbiting dots */}
					<div className="absolute inset-0 h-28 w-28 animate-[spin_5s_linear_infinite]">
						<div className="-top-1 -translate-x-1/2 absolute left-1/2 h-3 w-3 rounded-full bg-primary/80 shadow-[0_0_8px_rgba(255,219,51,0.5)]" />
					</div>
					<div className="absolute inset-0 h-28 w-28 animate-[spin_5s_linear_infinite_reverse] delay-2000">
						<div className="-bottom-1 -translate-x-1/2 absolute left-1/2 h-3 w-3 rounded-full bg-accent/60 shadow-[0_0_8px_rgba(250,229,131,0.5)]" />
					</div>
				</div>

				{/* Loading text with brand styling */}
				<div className="mt-14 flex flex-col items-center gap-2">
					<p className="font-semibold text-foreground text-lg">Loading</p>
					<div className="flex items-center gap-1">
						<span className="animate-[bounce_1.4s_ease-in-out_infinite] text-primary delay-0">
							•
						</span>
						<span className="animate-[bounce_1.4s_ease-in-out_infinite] text-primary delay-200">
							•
						</span>
						<span className="animate-[bounce_1.4s_ease-in-out_infinite] text-primary delay-400">
							•
						</span>
					</div>
				</div>

				{/* Ambient glow effect */}
				<div className="-z-10 absolute inset-0 opacity-30">
					<div className="-translate-x-1/2 -translate-y-1/2 absolute top-1/2 left-1/2 h-40 w-40 animate-[pulse_4s_ease-in-out_infinite] rounded-full bg-gradient-radial from-primary/40 via-primary/20 to-transparent blur-2xl" />
				</div>
			</div>
		</div>
	);
};

export default Loader;

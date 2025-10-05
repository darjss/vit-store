import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			toastOptions={{
				classNames: {
					toast:
						"h-auto w-full p-4 bg-primary border group toast group-[.toaster]:bg-primary group-[.toaster]:text-primary-foreground group-[.toaster]:border-border flex items-center relative",
					description:
						"group-[.toast]:text-muted-foreground ml-2 text-sm font-sans",
					actionButton:
						"group-[.toast]:bg-secondary group-[.toast]:text-secondary-foreground py-1 px-2 bg-secondary border-border shadow border-2 ml-auto h-fit min-w-fit",
					cancelButton:
						"group-[.toast]:bg-accent group-[.toast]:text-accent-foreground py-1 px-2 text-sm bg-accent border-border shadow border-2 ml-auto h-fit min-w-fit",
					title: "ml-2 font-sans",
					closeButton: "absolute bg-accent -top-1 -left-1 rounded-full p-0.5",
				},
				unstyled: true,
			}}
			{...props}
		/>
	);
};

export { Toaster };

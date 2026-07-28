export type ErrorPresentationAction = "retry" | "edit" | "go-back" | "refresh";

export type ErrorPresentation = {
	title: string;
	description: string;
	reassurance?: string;
	actions: readonly ErrorPresentationAction[];
};

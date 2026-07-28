export type ErrorAction = {
	label: string;
	kind:
		| "retry"
		| "edit-contact"
		| "request-code"
		| "sign-in"
		| "browse-products"
		| "go-back";
};

export type ErrorPresentation = {
	title: string;
	description: string;
	reassurance?: string;
	actions: readonly ErrorAction[];
};

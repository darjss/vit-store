import * as v from "valibot";

export type AppErrorDisplay = {
	message: string;
	raw: string;
	stack: string;
};

const displayFromError = v.pipe(
	v.instance(Error),
	v.transform((error): AppErrorDisplay => ({
		message: error.message,
		raw: String(error),
		stack: error.stack ?? "",
	})),
);

const displayFromString = v.pipe(
	v.string(),
	v.transform((asString): AppErrorDisplay => ({
		message: asString,
		raw: asString,
		stack: "",
	})),
);

const unknownFallback = (raw: string): AppErrorDisplay => ({
	message: "Тодорхойгүй алдаа.",
	raw,
	stack: "",
});

export function formatAppErrorDisplay(error: Error | string): AppErrorDisplay {
	const fromError = v.safeParse(displayFromError, error);
	if (fromError.success) {
		return fromError.output;
	}

	const fromString = v.safeParse(displayFromString, error);
	if (fromString.success) {
		return fromString.output;
	}

	try {
		const asString = JSON.stringify(error, null, 2);
		return {
			message: asString,
			raw: asString,
			stack: "",
		};
	} catch {
		return unknownFallback(String(error));
	}
}

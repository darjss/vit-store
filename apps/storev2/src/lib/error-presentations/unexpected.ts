import type { ErrorPresentation } from "./types";

export const unexpectedErrorPresentation = {
	title: "Үйлчилгээнд түр саатал гарлаа",
	description:
		"Мэдээллийг ачаалж чадсангүй. Хэсэг хүлээгээд дахин оролдоно уу.",
	reassurance: "Саатлыг хоосон эсвэл байхгүй мэдээлэл гэж харуулаагүй.",
	actions: [
		{ kind: "retry", label: "Дахин оролдох" },
		{ kind: "go-back", label: "Буцах" },
	],
} satisfies ErrorPresentation;

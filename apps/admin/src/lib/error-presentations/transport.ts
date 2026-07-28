import type { ErrorPresentation } from "./types";

const SAFE_CORRELATION_ID = /^[A-Za-z0-9_.:-]{1,80}$/;

const asRecord = (value: unknown) =>
	value !== null && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;

export const getCorrelationId = (error: unknown) => {
	const root = asRecord(error);
	const data = asRecord(root?.data);
	const shape = asRecord(root?.shape);
	const shapeData = asRecord(shape?.data);
	const value = data?.correlationId ?? shapeData?.correlationId;
	return typeof value === "string" && SAFE_CORRELATION_ID.test(value)
		? value
		: undefined;
};

export const presentTransportError = (error: unknown): ErrorPresentation => {
	const correlationId = getCorrelationId(error);
	return {
		title: "Системтэй холбогдож чадсангүй",
		description: "Түр хүлээгээд энэ үйлдлийг дахин оролдоно уу.",
		reassurance: correlationId
			? `Алдааны дугаар: ${correlationId}`
			: "Оруулсан мэдээллээ шалгаад аюулгүйгээр дахин оролдож болно.",
		actions: ["retry", "go-back"],
	};
};

import { number, safeParse } from "valibot";

const chartTooltipValueSchema = number();

type ChartTooltipValue = string | number | ReadonlyArray<string | number> | null | undefined;

export function chartTooltipNumber(value: ChartTooltipValue): number {
	const scalar = Array.isArray(value) ? value[0] : value;
	const parsed = safeParse(chartTooltipValueSchema, scalar);
	return parsed.success ? parsed.output : 0;
}

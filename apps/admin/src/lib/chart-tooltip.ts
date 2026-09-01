import * as v from "valibot";

const chartTooltipValueSchema = v.number();

type ChartTooltipValue = string | number | ReadonlyArray<string | number> | null | undefined;

export function chartTooltipNumber(value: ChartTooltipValue): number {
	const scalar = Array.isArray(value) ? value[0] : value;
	const parsed = v.safeParse(chartTooltipValueSchema, scalar);
	return parsed.success ? parsed.output : 0;
}

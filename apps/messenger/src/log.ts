// One canonical JSON line per turn. Wide fields beat many narrow lines: grep
// for `event":"turn"` gets the whole story.
export const turnLog = (fields: {
	conversation: string;
	inputs: number;
	model: string;
	outcome: string;
	photos: number;
	product_ids: Array<number>;
	step_ms: Array<number>;
	steps: number;
	tokens_cached: number;
	tokens_in: number;
	tokens_out: number;
	tools: Array<string>;
	total_ms: number;
}) => {
	console.log(JSON.stringify({ event: "turn", ...fields }));
};

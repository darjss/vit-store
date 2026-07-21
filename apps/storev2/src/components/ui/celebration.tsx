import { onMount } from "solid-js";
import {
	type CelebrationIntensity,
	celebrateOnce,
} from "@/lib/celebration";

const Celebration = (props: {
	eventKey: string;
	intensity?: CelebrationIntensity;
}) => {
	onMount(() => {
		celebrateOnce(props.eventKey, props.intensity ?? "strong");
	});

	return null;
};

export default Celebration;

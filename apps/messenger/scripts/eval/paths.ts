import { homedir } from "node:os";
import { join } from "node:path";

// One fixed home for eval data on this machine, outside every checkout and
// worktree: it holds real customer text and must never be committed.
export const EVAL_DIR =
	process.env.MESSENGER_EVAL_DIR ??
	join(homedir(), "dev", "scratchpad", "vit-store", "messenger-eval");

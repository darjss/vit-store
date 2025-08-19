import type { UserSelectType } from "../../../server/src/db/schema";

export interface Session {
	id: string;
	user: UserSelectType;
	expiresAt: Date;
}

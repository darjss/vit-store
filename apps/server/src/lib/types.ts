import type { CustomerSelectType } from "@/db/schema";

export interface Session {
  id: string;
  user: CustomerSelectType;
  expiresAt: Date;
}
export interface SessionConfig{
  kvSessionPrefix: string;
  kvUserSessionPrefix:string;
  cookieName:string;
  domainEnvVar:string;
  sessionDurationMs:number;
  renewalThresholdMs:number;
}
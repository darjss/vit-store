import { sha256 } from "@oslojs/crypto/sha2";
import {
  encodeBase32LowerCaseNoPadding,
  encodeHexLowerCase,
} from "@oslojs/encoding";

import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { CustomerSelectType, UserSelectType } from "@/db/schema";
import type { Context } from "../context";
import type { SessionConfig } from "../types";

export interface Session<TUser = CustomerSelectType | UserSelectType> {
  id: string;
  user: TUser;
  expiresAt: Date;
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return encodeBase32LowerCaseNoPadding(bytes);
}

export function createSessionManager<
  TUser extends CustomerSelectType | UserSelectType,
>(config: SessionConfig) {
  const {
    kvSessionPrefix,
    kvUserSessionPrefix,
    cookieName,
    domainEnvVar,
    sessionDurationMs,
    renewalThresholdMs,
  } = config;

  function getUserIdentifier(user: TUser): string {
    if ("phone" in user && user.phone) {
      return user.phone.toString();
    }
    if ("id" in user && user.id) {
      return user.id.toString();
    }
    throw new Error("Unable to determine user identifier");
  }

  async function createSession(
    user: TUser,
    ctx: Context
  ): Promise<{ session: Session<TUser>; token: string }> {
    const token = generateSessionToken();
    const sessionId = encodeHexLowerCase(
      sha256(new TextEncoder().encode(token))
    );
    const session: Session<TUser> = {
      id: sessionId,
      user,
      expiresAt: new Date(Date.now() + sessionDurationMs),
    };

    const userIdentifier = getUserIdentifier(user);

    await ctx.kv.put(
      `${kvSessionPrefix}:${session.id}`,
      JSON.stringify({
        id: session.id,
        user: session.user,
        expires_at: Math.floor(session.expiresAt.getTime() / 1000),
      }),
      {
        expirationTtl: Math.floor(session.expiresAt.getTime() / 1000),
      }
    );
    await ctx.kv.put(`${kvUserSessionPrefix}:${userIdentifier}`, sessionId);

    return { session, token };
  }

  async function validateSessionToken(
    token: string,
    ctx: Context
  ): Promise<Session<TUser> | null> {
    const sessionId = encodeHexLowerCase(
      sha256(new TextEncoder().encode(token))
    );
    const rawSession = await ctx.kv.get(`${kvSessionPrefix}:${sessionId}`);

    if (!rawSession) {
      return null;
    }

    const result = JSON.parse(rawSession) as {
      id: string;
      user: TUser;
      expires_at: number;
    };

    const session: Session<TUser> = {
      id: result.id,
      user: result.user,
      expiresAt: new Date(result.expires_at * 1000),
    };

    if (
      session === null ||
      session === undefined ||
      session.user === null ||
      session.user === undefined ||
      session.id === null ||
      session.id === undefined
    ) {
      return null;
    }

    const expiresAt = new Date(session.expiresAt);

    if (Date.now() >= expiresAt.getTime()) {
      await ctx.kv.delete(`${kvSessionPrefix}:${sessionId}`);
      return null;
    }

    if (Date.now() >= expiresAt.getTime() - renewalThresholdMs) {
      const updatedSession = {
        ...session,
        expiresAt: new Date(Date.now() + sessionDurationMs),
      };
      await ctx.kv.put(
        `${kvSessionPrefix}:${session.id}`,
        JSON.stringify({
          id: updatedSession.id,
          user: updatedSession.user,
          expires_at: Math.floor(updatedSession.expiresAt.getTime() / 1000),
        }),
        {
          expirationTtl: Math.floor(updatedSession.expiresAt.getTime() / 1000),
        }
      );
      return updatedSession;
    }

    return session;
  }

  async function invalidateSession(ctx: Context): Promise<void> {
    if (ctx.session?.id) {
      await ctx.kv.delete(`${kvSessionPrefix}:${ctx.session.id}`);
    }
    deleteSessionTokenCookie(ctx);
  }

  function setSessionTokenCookie(
    ctx: Context,
    token: string,
    expiresAt: Date
  ): void {
    console.log(process.env.DOMAIN);
    setCookie(ctx.c, cookieName, token, {
      httpOnly: true,
      sameSite: "None",
      secure: true,
      expires: expiresAt,
      path: "/",
      domain: process.env.DOMAIN,
    });
  }

  function deleteSessionTokenCookie(ctx: Context): void {
    deleteCookie(ctx.c, cookieName, {
      httpOnly: true,
      sameSite: "None",
      secure: true,
      expires: ctx.session?.expiresAt,
      path: "/",
      domain: process.env.DOMAIN,
    });
  }

  const auth = async (ctx: Context): Promise<Session<TUser> | null> => {
    console.log(`[${cookieName}] auth: checking for cookie`);
    console.log(`[${cookieName}] auth: context type:`, typeof ctx.c);
    console.log(
      `[${cookieName}] auth: cookie header:`,
      ctx.c.req.header("cookie")
    );
    const token = getCookie(ctx.c, cookieName);
    console.log(`[${cookieName}] auth: token value:`, token);

    if (token === undefined) {
      console.log(`[${cookieName}] auth: no token found, returning null`);
      return null;
    }

    return await validateSessionToken(token, ctx);
  };

  return {
    createSession,
    validateSessionToken,
    invalidateSession,
    setSessionTokenCookie,
    deleteSessionTokenCookie,
    auth,
  };
}

// Pre-configured session managers for convenience
export const createCustomerSessionManager = (config: SessionConfig) =>
  createSessionManager<CustomerSelectType>(config);

export const createUserSessionManager = (config: SessionConfig) =>
  createSessionManager<UserSelectType>(config);

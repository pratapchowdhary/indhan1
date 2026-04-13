import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/** Decode the base64 state back to the origin URL (e.g. https://indhan.manus.space) */
function originFromState(state: string | undefined): string {
  if (!state) return "/";
  try {
    const decoded = Buffer.from(state, "base64").toString("utf-8");
    // state = btoa(redirectUri) where redirectUri = origin + "/api/oauth/callback"
    const url = new URL(decoded);
    return url.origin;
  } catch {
    return "/";
  }
}

export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      // Redirect to the app home with an error flag so the SPA can show a
      // user-friendly "Login expired — please try again" message.
      const origin = originFromState(state);
      res.redirect(302, `${origin}/?auth_error=expired`);
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        const origin = originFromState(state);
        res.redirect(302, `${origin}/?auth_error=no_openid`);
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      const origin = originFromState(state);
      res.redirect(302, `${origin}/?auth_error=failed`);
    }
  });
}

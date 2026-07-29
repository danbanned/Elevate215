import { NextRequest, NextResponse } from "next/server";
import { loadEnv } from "@lp-ai/lib-config";
import { saveQuickBooksCredentials } from "../quickbooks-client";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const realmId = searchParams.get("realmId");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/quickbooks/error", req.url));
  }
  if (!code || !realmId) {
    return NextResponse.json({ error: "Missing code or realmId" }, { status: 400 });
  }

  // TODO: validate `state` against what you generated when starting the auth flow (CSRF check)

  const env = await loadEnv();
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = env.QUICKBOOKS_REDIRECT_URI; // must exactly match what's registered in Intuit dashboard
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "QuickBooks connector not configured" }, { status: 500 });
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenResponse = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    console.error("QuickBooks token exchange failed:", errText);
    return NextResponse.redirect(new URL("/quickbooks/error", req.url));
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  await saveQuickBooksCredentials({
    realmId,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  });

  return NextResponse.redirect(new URL("/quickbooks/connected", req.url));
}
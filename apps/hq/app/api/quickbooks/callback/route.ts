import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, saveQuickBooksCredentials } from "@lp-ai/connector-quickbooks";

const STATE_COOKIE = "qb_oauth_state";

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  if (!expectedState || expectedState !== state) {
    console.error("QuickBooks callback: state mismatch (possible CSRF or expired session)");
    return NextResponse.redirect(new URL("/quickbooks/error", req.url));
  }

  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code);
  } catch (err) {
    console.error("QuickBooks token exchange failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.redirect(new URL("/quickbooks/error", req.url));
  }

  await saveQuickBooksCredentials({
    realmId,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresIn: tokens.expiresIn,
  });

  const res = NextResponse.redirect(new URL("/quickbooks/connected", req.url));
  res.cookies.delete(STATE_COOKIE);
  return res;
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { buildAuthorizationUrl } from "@lp-ai/connector-quickbooks";

const STATE_COOKIE = "qb_oauth_state";
const STATE_COOKIE_MAX_AGE_S = 600; // 10 minutes — plenty for the Intuit consent screen round trip

export async function GET(req: NextRequest): Promise<NextResponse> {
  const state = crypto.randomBytes(24).toString("hex");
  const authUrl = await buildAuthorizationUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE_S,
    path: "/api/quickbooks",
  });
  return res;
}

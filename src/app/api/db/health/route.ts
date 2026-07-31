import { NextResponse } from "next/server";
import { checkDbHealth } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await checkDbHealth();
    return NextResponse.json(health);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Database connection failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

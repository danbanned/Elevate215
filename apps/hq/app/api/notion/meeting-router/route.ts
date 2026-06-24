import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { loadEnv } from '@lp-ai/lib-config';
import { applyRouting } from './router-logic';

export const dynamic = 'force-dynamic';

/**
 * Notion API integration webhook → routes new meeting recordings to a Track.
 *
 * Flow:
 *   1. On subscription creation Notion POSTs a one-time { verification_token } —
 *      we log it so it can be pasted back into Notion's integration UI to confirm.
 *   2. Subsequent events are signed (X-Notion-Signature). We verify against
 *      NOTION_WEBHOOK_SECRET, then on a page added/updated in the Meetings DB we
 *      set its Track (applyRouting self-filters to our DB).
 *
 * Allow-listed in middleware.ts — Notion calls this unauthenticated; trust comes
 * from the signature, not a session.
 */
interface NotionWebhookBody {
  verification_token?: string;
  type?: string;
  entity?: { id?: string; type?: string };
}

// Notion event types that mean "a meeting note appeared / gained content".
const ROUTABLE_EVENT_TYPES = new Set(['page.created', 'page.content_updated']);

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);
  return provided.length === computed.length && crypto.timingSafeEqual(provided, computed);
}

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = await request.text();

  let body: NotionWebhookBody;
  try {
    body = JSON.parse(rawBody) as NotionWebhookBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  // 1. One-time subscription verification handshake.
  if (body.verification_token) {
    process.stdout.write(
      JSON.stringify({
        event: 'notion_webhook_verification',
        verification_token: body.verification_token,
      }) + '\n',
    );
    return NextResponse.json({ ok: true });
  }

  // 2. Verify the signature whenever a secret is configured.
  const env = await loadEnv();
  const secret = env.NOTION_WEBHOOK_SECRET;
  if (secret) {
    const signature = request.headers.get('X-Notion-Signature');
    if (!verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
    }
  }

  // 3. Route relevant page events; applyRouting confirms the page is in the Meetings DB.
  try {
    const pageId = body.entity?.id;
    if (body.type && ROUTABLE_EVENT_TYPES.has(body.type) && pageId) {
      const result = await applyRouting(pageId);
      process.stdout.write(JSON.stringify({ event: 'meeting_router', ...result }) + '\n');
    }
  } catch (err) {
    // Always return 200 below so Notion doesn't retry-storm; the failure is logged.
    process.stderr.write(
      `meeting-router error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  }

  return NextResponse.json({ ok: true });
}

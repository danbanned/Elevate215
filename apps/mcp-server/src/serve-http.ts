import * as Sentry from '@sentry/node';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { loadEnv } from '@lp-ai/lib-config';
import { prisma } from '@lp-ai/lib-db';

import { makeServer } from './make-server.js';
import { authenticateBearer, type CallerIdentity } from './auth.js';
import { jwks } from './oauth/jwks.js';
import { authorizationServerMetadata, protectedResourceMetadata } from './oauth/metadata.js';
import { registerClient } from './oauth/dcr.js';
import { handleAuthorize, handleGoogleCallback, handleToken } from './oauth/flow.js';
import { setCurrentCaller } from './tool-helpers.js';

const env = await loadEnv();
if (env.SENTRY_DSN_MCP) {
  Sentry.init({ dsn: env.SENTRY_DSN_MCP, environment: process.env['NODE_ENV'], tracesSampleRate: 0.1 });
}
const PORT = Number(process.env['PORT'] ?? '8080');

// One McpServer + StreamableHTTPServerTransport per *client session* — sharing
// a single transport across clients trips the "Server already initialized"
// guard the moment the second client tries to handshake. Sessions are keyed
// by the Mcp-Session-Id header the SDK negotiates during initialize.
//
// We also keep an "uninitialized" transport on standby so we can hand it to
// the first request from a client that hasn't picked up a session ID yet.
const sessions = new Map<string, StreamableHTTPServerTransport>();

function createTransport(): StreamableHTTPServerTransport {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      sessions.set(sessionId, transport);
    },
    onsessionclosed: (sessionId: string) => {
      sessions.delete(sessionId);
    },
  });
  const server = makeServer();
  void server.connect(transport as unknown as Transport);
  return transport;
}

async function transportForRequest(req: IncomingMessage): Promise<StreamableHTTPServerTransport> {
  const sid = req.headers['mcp-session-id'];
  if (typeof sid === 'string' && sessions.has(sid)) {
    return sessions.get(sid)!;
  }
  // No session yet — this is either the initial POST or a request from
  // a client that lost its session ID. Hand out a fresh transport; if the
  // request happens to be `initialize`, the onsessioninitialized callback
  // will register it. Other requests will just fail at the protocol layer,
  // which is the correct behavior per the MCP spec.
  return createTransport();
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  if (chunks.length === 0) return undefined;
  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') return undefined;
  return JSON.parse(text);
}

async function readFormBody(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function logOauth(req: IncomingMessage, status: number, extra: Record<string, unknown> = {}): void {
  const url = req.url ?? '';
  if (!url.startsWith('/oauth/') && !url.startsWith('/.well-known/')) return;
  process.stdout.write(
    JSON.stringify({
      lvl: 'info',
      kind: 'oauth',
      method: req.method,
      url,
      status,
      ua: req.headers['user-agent'],
      ...extra,
    }) + '\n',
  );
}

const httpServer = createServer((req, res) => {
  void (async () => {
    try {
      const rawUrl = req.url ?? '/';
      const url = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;
      // Capture the response status so we can log it after the handler runs.
      const origWriteHead = res.writeHead.bind(res);
      let responseStatus = 0;
      res.writeHead = ((status: number, ...rest: unknown[]) => {
        responseStatus = status;
        return (origWriteHead as unknown as (...args: unknown[]) => unknown)(status, ...rest);
      }) as typeof res.writeHead;
      res.on('finish', () => logOauth(req, responseStatus));

      // ----- health -----
      if (path === '/health' || path === '/') {
        try {
          await prisma.$queryRaw`SELECT 1`;
          sendJson(res, 200, { status: 'ok', ts: new Date().toISOString() });
        } catch (err) {
          sendJson(res, 503, {
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      // ----- OAuth discovery metadata -----
      if (path === '/.well-known/oauth-protected-resource') {
        sendJson(res, 200, await protectedResourceMetadata());
        return;
      }
      if (path === '/.well-known/oauth-authorization-server') {
        sendJson(res, 200, await authorizationServerMetadata());
        return;
      }
      if (path === '/.well-known/jwks.json') {
        sendJson(res, 200, await jwks());
        return;
      }

      // ----- Dynamic Client Registration -----
      if (path === '/oauth/register' && req.method === 'POST') {
        try {
          const body = (await readBody(req)) as Record<string, unknown>;
          const out = await registerClient({
            client_name: body['client_name'] as string | undefined,
            redirect_uris: body['redirect_uris'] as string[],
          });
          sendJson(res, 201, out);
        } catch (err) {
          sendJson(res, 400, {
            error: 'invalid_client_metadata',
            error_description: err instanceof Error ? err.message : 'bad registration',
          });
        }
        return;
      }

      // ----- Authorize (browser arrives here) -----
      if (path === '/oauth/authorize' && req.method === 'GET') {
        const result = await handleAuthorize(url.searchParams);
        if (result.status === 302) {
          sendRedirect(res, result.redirect);
        } else {
          sendJson(res, result.status, { error: 'invalid_request' });
        }
        return;
      }

      // ----- Google callback -----
      if (path === '/oauth/google-callback' && req.method === 'GET') {
        const result = await handleGoogleCallback(url.searchParams);
        if (result.status === 302) {
          sendRedirect(res, result.redirect);
        } else if (result.body && result.body.startsWith('<!doctype')) {
          sendHtml(res, result.status, result.body);
        } else {
          sendJson(res, result.status, { error: result.body ?? 'callback_failed' });
        }
        return;
      }

      // ----- Token exchange -----
      if (path === '/oauth/token' && req.method === 'POST') {
        const body = await readFormBody(req);
        const result = await handleToken(body);
        sendJson(res, result.status, result.json);
        return;
      }

      // ----- MCP protocol -----
      if (path === '/mcp') {
        const identity = await authenticateBearer(req.headers['authorization'] as string | undefined);
        if (!identity) {
          sendJson(res, 401, { error: 'unauthorized' });
          return;
        }
        setCurrentCaller(identity);
        try {
          const body = await readBody(req);
          const t = await transportForRequest(req);
          await t.handleRequest(req, res, body);
        } finally {
          setCurrentCaller(null);
        }
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`http error: ${message}\n`);
      try {
        sendJson(res, 500, { error: 'internal_error', message });
      } catch {
        // headers already sent
      }
    }
  })();
});

httpServer.listen(PORT, () => {
  process.stdout.write(
    `MCP server listening on http://0.0.0.0:${PORT.toString()} (mcp at /mcp, oauth at /oauth/*, health at /health)\n`,
  );
});

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    process.stdout.write(`\nReceived ${signal}, shutting down...\n`);
    httpServer.close(() => {
      Promise.all(Array.from(sessions.values()).map((t) => t.close().catch(() => undefined)))
        .then(() => process.exit(0))
        .catch(() => process.exit(0));
    });
  });
}

// Re-export for typing; CallerIdentity is consumed by tool-helpers
export type { CallerIdentity };

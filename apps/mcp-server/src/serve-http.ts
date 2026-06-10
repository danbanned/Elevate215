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

const mcpServer = makeServer();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
});

await mcpServer.connect(transport as unknown as Transport);

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

const httpServer = createServer((req, res) => {
  void (async () => {
    try {
      const rawUrl = req.url ?? '/';
      const url = new URL(rawUrl, `http://${req.headers.host ?? 'localhost'}`);
      const path = url.pathname;

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
          await transport.handleRequest(req, res, body);
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
      void mcpServer.close().then(() => process.exit(0));
    });
  });
}

// Re-export for typing; CallerIdentity is consumed by tool-helpers
export type { CallerIdentity };

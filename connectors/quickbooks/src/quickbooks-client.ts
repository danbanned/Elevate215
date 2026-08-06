import { loadEnv } from '@lp-ai/lib-config';
import { prisma } from '@lp-ai/lib-db';

import {
  QuickBooksApiError,
  QuickBooksNotConnectedError,
  QuickBooksReauthRequiredError,
  classifyQuickBooksApiError,
  type QuickBooksError,
  type QuickBooksErrorContext,
} from './errors.js';
import { logQuickBooksError, type QuickBooksErrorLogSink } from './quickbooks-error-logging.js';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE = 'com.intuit.quickbooks.accounting';
const INTUIT_TID_HEADER = 'intuit_tid';
export const QUICKBOOKS_SANDBOX_API_BASE_URL = 'https://sandbox-quickbooks.api.intuit.com';

// Matches Aplos's 60s buffer, but unlike Aplos there is no in-memory cache here —
// every call re-reads the stored credential, since a refresh must be persisted to
// the DB (in-memory-only caching would lose the rotated refresh token on restart,
// which is the exact bug this connector replaces).
const EXPIRY_BUFFER_MS = 60_000;

interface TokenResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface QuickBooksRequestOptions extends RequestInit {
  /** Realm ID this request is scoped to — attached to any thrown error / log entry. */
  realmId?: string;
  /** Optional override for where errors get logged. Defaults to console. */
  errorLogSink?: QuickBooksErrorLogSink;
  /** Set false to skip auto-logging (e.g. if the caller wants to log it themselves). */
  logErrors?: boolean;
  /**
   * Override how a non-ok response becomes an Error. The OAuth token endpoint
   * uses this — its error body shape (`{ error, error_description }`) and its
   * invalid_grant -> QuickBooksReauthRequiredError special case don't fit the
   * Data API's classifyQuickBooksApiError. Omit for Data API calls, where the
   * default classifier is correct.
   */
  classifyError?: (statusCode: number, bodyText: string, context: QuickBooksErrorContext) => QuickBooksError;
}

/**
 * Shared low-level QuickBooks request wrapper — used by both the OAuth token
 * calls below and (once Phase 2 is built) data calls. Captures the
 * `intuit_tid` response header on every call and attaches it to whatever
 * error gets thrown, so a failure can always be handed to Intuit support as
 * "here's the exact request, here's the ID."
 *
 * On a non-ok response, classifies the failure (via `classifyError` if given,
 * else `classifyQuickBooksApiError`), logs it through `logQuickBooksError`,
 * and throws it — callers only need to unwrap a successful Response.
 */
export async function quickBooksRequest(
  url: string,
  options: QuickBooksRequestOptions = {},
): Promise<Response> {
  const { realmId, errorLogSink, logErrors = true, classifyError, ...fetchOptions } = options;

  const response = await fetch(url, fetchOptions);
  const intuitTid = response.headers.get(INTUIT_TID_HEADER) ?? undefined;

  if (!response.ok) {
    const context: QuickBooksErrorContext = { realmId, endpoint: safeEndpoint(url), intuitTid };
    const bodyText = await response.clone().text();

    const error: QuickBooksError = classifyError
      ? classifyError(response.status, bodyText, context)
      : classifyQuickBooksApiError(response.status, safeJsonParse(bodyText), context);

    if (logErrors) {
      await logQuickBooksError(error, errorLogSink);
    }
    throw error;
  }

  return response;
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Strips query params / host so logs don't leak tokens or realm-specific query strings. */
function safeEndpoint(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

// Mirrors quickbooks-accounting-client.ts's sandbox/production host
// selection. Sandbox mode is either QUICKBOOKS_API_BASE_URL being unset
// (defaults to the sandbox host) OR explicitly set to that same sandbox
// host — not just "unset," since ours is set explicitly. When in sandbox
// mode, token-endpoint calls also need sandbox-app credentials, not the
// production app's QUICKBOOKS_CLIENT_ID/SECRET — Intuit ties a refresh
// token to the specific app that issued it; using the wrong pair fails
// with invalid_grant ("Incorrect Token type or clientID"), not a clearer
// error.
function isSandboxMode(env: { QUICKBOOKS_API_BASE_URL?: string | undefined }): boolean {
  return !env.QUICKBOOKS_API_BASE_URL || env.QUICKBOOKS_API_BASE_URL === QUICKBOOKS_SANDBOX_API_BASE_URL;
}

export async function buildAuthorizationUrl(state: string): Promise<string> {
  const env = await loadEnv();
  const clientId = env.QUICKBOOKS_CLIENT_ID || env.QUICKBOOKS_DEV_CLIENT_ID;
  const redirectUri = env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('QUICKBOOKS_CLIENT_ID (or QUICKBOOKS_DEV_CLIENT_ID) / QUICKBOOKS_REDIRECT_URI not set');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPE,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResult> {
  const env = await loadEnv();
  const sandbox = isSandboxMode(env);
  const clientId =
    (sandbox && env.QUICKBOOKS_CLIENT_ID_SANDBOX) || env.QUICKBOOKS_CLIENT_ID || env.QUICKBOOKS_DEV_CLIENT_ID;
  const clientSecret =
    (sandbox && env.QUICKBOOKS_CLIENT_SECRET_SANDBOX) || env.QUICKBOOKS_CLIENT_SECRET || env.QUICKBOOKS_DEV_CLIENT_SECRET;
  const redirectUri = env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('QUICKBOOKS_CLIENT_ID (or QUICKBOOKS_DEV_CLIENT_ID) / QUICKBOOKS_CLIENT_SECRET (or QUICKBOOKS_DEV_CLIENT_SECRET) / QUICKBOOKS_REDIRECT_URI not set');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await quickBooksRequest(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    classifyError: (statusCode, bodyText, context) =>
      new QuickBooksApiError(
        `QuickBooks token exchange failed: ${statusCode} — ${bodyText.slice(0, 300)}`,
        statusCode,
        [],
        context.realmId,
        context.endpoint,
        context.intuitTid,
      ),
  });

  const tokens = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in };
}

async function refreshTokens(realmId: string, refreshToken: string): Promise<TokenResult> {
  const env = await loadEnv();
  const sandbox = isSandboxMode(env);
  const clientId = (sandbox && env.QUICKBOOKS_CLIENT_ID_SANDBOX) || env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = (sandbox && env.QUICKBOOKS_CLIENT_SECRET_SANDBOX) || env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET not set');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await quickBooksRequest(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    realmId,
    classifyError: (statusCode, bodyText, context) => {
      let errorCode: string | undefined;
      try {
        errorCode = (JSON.parse(bodyText) as { error?: string }).error;
      } catch {
        // not JSON — fall through to the generic error below
      }
      if (statusCode === 400 && errorCode === 'invalid_grant') {
        return new QuickBooksReauthRequiredError(realmId, bodyText.slice(0, 300), context.intuitTid);
      }
      return new QuickBooksApiError(
        `QuickBooks token refresh failed: ${statusCode} — ${bodyText.slice(0, 300)}`,
        statusCode,
        [],
        context.realmId,
        context.endpoint,
        context.intuitTid,
      );
    },
  });

  const tokens = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in };
}

export interface SaveQuickBooksCredentialsInput extends TokenResult {
  realmId: string;
}

export async function saveQuickBooksCredentials(input: SaveQuickBooksCredentialsInput): Promise<void> {
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000);
  await prisma.connectorCredential.upsert({
    where: {
      connector_externalAccountId: {
        connector: 'quickbooks',
        externalAccountId: input.realmId,
      },
    },
    create: {
      connector: 'quickbooks',
      externalAccountId: input.realmId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
    },
    update: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
    },
  });
}

export async function getQuickBooksAccessToken(realmId: string): Promise<string> {
  const credential = await prisma.connectorCredential.findUnique({
    where: {
      connector_externalAccountId: {
        connector: 'quickbooks',
        externalAccountId: realmId,
      },
    },
  });
  if (!credential) {
    throw new QuickBooksNotConnectedError(realmId);
  }

  if (credential.expiresAt.getTime() > Date.now() + EXPIRY_BUFFER_MS) {
    return credential.accessToken;
  }

  const refreshed = await refreshTokens(realmId, credential.refreshToken);
  await saveQuickBooksCredentials({ realmId, ...refreshed });
  return refreshed.accessToken;
}

import { loadEnv } from '@lp-ai/lib-config';
import { prisma } from '@lp-ai/lib-db';

import { QuickBooksNotConnectedError, QuickBooksReauthRequiredError } from './errors.js';

const AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPE = 'com.intuit.quickbooks.accounting';

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

export async function buildAuthorizationUrl(state: string): Promise<string> {
  const env = await loadEnv();
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const redirectUri = env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_REDIRECT_URI not set');
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
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET;
  const redirectUri = env.QUICKBOOKS_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET / QUICKBOOKS_REDIRECT_URI not set');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch(TOKEN_URL, {
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
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`QuickBooks token exchange failed: ${r.status} ${r.statusText} — ${errText.slice(0, 300)}`);
  }

  const tokens = (await r.json()) as { access_token: string; refresh_token: string; expires_in: number };
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresIn: tokens.expires_in };
}

async function refreshTokens(realmId: string, refreshToken: string): Promise<TokenResult> {
  const env = await loadEnv();
  const clientId = env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET not set');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const r = await fetch(TOKEN_URL, {
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
  });

  if (!r.ok) {
    const errText = await r.text();
    let errorCode: string | undefined;
    try {
      errorCode = (JSON.parse(errText) as { error?: string }).error;
    } catch {
      // not JSON — fall through to the generic error below
    }
    if (r.status === 400 && errorCode === 'invalid_grant') {
      throw new QuickBooksReauthRequiredError(realmId, errText.slice(0, 300));
    }
    throw new Error(`QuickBooks token refresh failed: ${r.status} ${r.statusText} — ${errText.slice(0, 300)}`);
  }

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

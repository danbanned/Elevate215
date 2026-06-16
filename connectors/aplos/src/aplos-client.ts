import crypto from 'node:crypto';
import { loadEnv } from '@lp-ai/lib-config';

const BASE_URL = 'https://app.aplos.com';
const AUTH_PATH_PREFIX = '/hermes/api/v1/auth/';
const USER_AGENT = 'LaunchpadInternalAI/1.0';

let cachedToken: { value: string; expiresAt: number } | null = null;

async function loadPrivateKey(): Promise<crypto.KeyObject> {
  const env = await loadEnv();
  const apiKey = env.APLOS_API_KEY;
  if (!apiKey) throw new Error('APLOS_API_KEY not set');
  const pem = '-----BEGIN PRIVATE KEY-----\n' + apiKey.match(/.{1,64}/g)!.join('\n') + '\n-----END PRIVATE KEY-----\n';
  return crypto.createPrivateKey({ key: pem, format: 'pem' });
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const env = await loadEnv();
  const clientId = env.APLOS_CLIENT_ID;
  if (!clientId) throw new Error('APLOS_CLIENT_ID not set');

  const r = await fetch(BASE_URL + AUTH_PATH_PREFIX + clientId, {
    headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
  });
  if (!r.ok) {
    throw new Error(`Aplos auth failed: ${r.status} ${r.statusText} — ${await r.text()}`);
  }
  const payload = (await r.json()) as { data: { token: string; expires: string } };
  const encrypted = Buffer.from(payload.data.token, 'base64');
  const decrypted = crypto.privateDecrypt(
    { key: await loadPrivateKey(), padding: crypto.constants.RSA_PKCS1_PADDING },
    encrypted,
  ).toString();

  cachedToken = {
    value: decrypted,
    expiresAt: new Date(payload.data.expires).getTime(),
  };
  return decrypted;
}

export function resetTokenCache(): void {
  cachedToken = null;
}

export async function aplosFetch<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : BASE_URL + path;
  const r = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
  });
  if (!r.ok) {
    throw new Error(`Aplos GET ${path} failed: ${r.status} ${r.statusText} — ${(await r.text()).slice(0, 300)}`);
  }
  return (await r.json()) as T;
}

interface AplosResponse<T> {
  version: string;
  status: number;
  meta?: { resource_count?: number };
  links?: { next?: string; self?: string };
  data: T;
}

export async function* aplosPaginate<TRecord>(
  path: string,
  arrayKey: string,
  pageSize = 250,
): AsyncGenerator<TRecord> {
  const sep = path.includes('?') ? '&' : '?';
  let next: string | null = `${path}${sep}page_size=${pageSize}&page_num=1`;
  while (next) {
    const resp: AplosResponse<Record<string, TRecord[]>> = await aplosFetch<AplosResponse<Record<string, TRecord[]>>>(next);
    const arr: TRecord[] = resp.data[arrayKey] ?? [];
    for (const item of arr) yield item;
    const nextLink: string | undefined = resp.links?.next;
    next = nextLink ? nextLink.replace(/^\/api\//, '/hermes/api/') : null;
  }
}

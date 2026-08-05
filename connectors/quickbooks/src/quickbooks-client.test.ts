import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock('@lp-ai/lib-db', () => ({
  prisma: {
    connectorCredential: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
    },
  },
}));

// A plain async function, not vi.fn() — this repo's `vi.restoreAllMocks()`
// convention (below) would otherwise wipe out a vi.fn()'s mockResolvedValue
// on every test, since it has no real "original" implementation to restore to.
vi.mock('@lp-ai/lib-config', () => ({
  loadEnv: async () => ({
    QUICKBOOKS_CLIENT_ID: 'test-client-id',
    QUICKBOOKS_CLIENT_SECRET: 'test-client-secret',
    QUICKBOOKS_REDIRECT_URI: 'https://example.org/api/quickbooks/callback',
  }),
}));

const { getQuickBooksAccessToken, quickBooksRequest } = await import('./quickbooks-client.js');
const { QuickBooksNotConnectedError, QuickBooksReauthRequiredError, QuickBooksApiError } = await import(
  './errors.js'
);

/**
 * Minimal fetch Response double. quickBooksRequest reads `.headers.get(...)`
 * on every response (success or failure) and, on failure, `.clone().text()` —
 * real Response.clone() returns a second independent stream, but since
 * nothing here reads the body twice, returning `this` is sufficient for a
 * test double.
 */
function fakeResponse(opts: {
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  bodyText?: string;
  json?: () => Promise<unknown>;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  const bodyText = opts.bodyText ?? '';
  const fake = {
    ok: opts.ok,
    status: opts.status ?? (opts.ok ? 200 : 400),
    statusText: opts.statusText ?? '',
    headers,
    json: opts.json ?? (async () => JSON.parse(bodyText || '{}')),
    text: async () => bodyText,
    clone() {
      return fake;
    },
  };
  return fake as unknown as Response;
}

describe('getQuickBooksAccessToken', () => {
  beforeEach(() => {
    findUnique.mockReset();
    upsert.mockReset();
    vi.restoreAllMocks();
  });

  it('throws QuickBooksNotConnectedError when no credential row exists for the realmId', async () => {
    findUnique.mockResolvedValue(null);

    await expect(getQuickBooksAccessToken('realm-missing')).rejects.toBeInstanceOf(
      QuickBooksNotConnectedError,
    );
    expect(upsert).not.toHaveBeenCalled();
  });

  it('returns the stored access token without refreshing when not yet expired', async () => {
    findUnique.mockResolvedValue({
      accessToken: 'access-current',
      refreshToken: 'refresh-current',
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const fetchSpy = vi.spyOn(global, 'fetch');

    const token = await getQuickBooksAccessToken('realm-1');

    expect(token).toBe('access-current');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('refreshes and persists new tokens when the stored token is expired', async () => {
    findUnique.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: new Date(Date.now() - 60_000),
    });
    vi.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({
        ok: true,
        json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
      }),
    );

    const token = await getQuickBooksAccessToken('realm-1');

    expect(token).toBe('new-access');
    expect(upsert).toHaveBeenCalledTimes(1);
    const upsertArg = upsert.mock.calls[0]?.[0] as {
      update: { accessToken: string; refreshToken: string };
    };
    expect(upsertArg.update.accessToken).toBe('new-access');
    expect(upsertArg.update.refreshToken).toBe('new-refresh');
  });

  it('throws QuickBooksReauthRequiredError when Intuit rejects the refresh token', async () => {
    findUnique.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'revoked-refresh',
      expiresAt: new Date(Date.now() - 60_000),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        bodyText: JSON.stringify({ error: 'invalid_grant' }),
      }),
    );

    await expect(getQuickBooksAccessToken('realm-1')).rejects.toBeInstanceOf(
      QuickBooksReauthRequiredError,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe('quickBooksRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves with the response on a successful call', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(fakeResponse({ ok: true, bodyText: '{}' }));

    const response = await quickBooksRequest('https://quickbooks.api.intuit.com/v3/company/123/query');

    expect(response.ok).toBe(true);
  });

  it('attaches the intuit_tid header to the thrown error when present', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({
        ok: false,
        status: 404,
        headers: { intuit_tid: 'test-tid-123' },
        bodyText: JSON.stringify({ Fault: { Error: [{ Message: 'Object Not Found', code: '610' }], type: 'ValidationFault' } }),
      }),
    );

    await expect(
      quickBooksRequest('https://quickbooks.api.intuit.com/v3/company/123/query', { realmId: '123' }),
    ).rejects.toMatchObject({ intuitTid: 'test-tid-123' });
  });

  it('leaves intuitTid undefined when the header is absent', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockResolvedValue(
      fakeResponse({ ok: false, status: 500, bodyText: '{}' }),
    );

    let thrown: InstanceType<typeof QuickBooksApiError> | undefined;
    try {
      await quickBooksRequest('https://quickbooks.api.intuit.com/v3/company/123/query', { realmId: '123' });
    } catch (err) {
      thrown = err as InstanceType<typeof QuickBooksApiError>;
    }

    expect(thrown).toBeInstanceOf(QuickBooksApiError);
    expect(thrown?.intuitTid).toBeUndefined();
  });
});

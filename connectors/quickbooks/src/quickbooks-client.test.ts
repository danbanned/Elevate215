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

const { getQuickBooksAccessToken } = await import('./quickbooks-client.js');
const { QuickBooksNotConnectedError, QuickBooksReauthRequiredError } = await import('./errors.js');

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
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
    } as Response);

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
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: 'invalid_grant' }),
    } as Response);

    await expect(getQuickBooksAccessToken('realm-1')).rejects.toBeInstanceOf(
      QuickBooksReauthRequiredError,
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});

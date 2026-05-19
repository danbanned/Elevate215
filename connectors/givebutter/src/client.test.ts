import { describe, expect, it, vi } from 'vitest';
import { createGivebutterClient } from './client.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('createGivebutterClient', () => {
  it('paginates contacts following the links.next URL', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 1, first_name: 'A' }, { id: 2, first_name: 'B' }],
          links: { next: 'https://api.givebutter.com/v1/contacts?page=2' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ id: 3, first_name: 'C' }],
          links: { next: null },
        }),
      );
    const client = createGivebutterClient({ apiKey: 'k', fetch: fetchMock });
    const out: number[] = [];
    for await (const c of client.listContacts()) out.push(Number(c.id));
    expect(out).toEqual([1, 2, 3]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://api.givebutter.com/v1/contacts',
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      'https://api.givebutter.com/v1/contacts?page=2',
    );
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(
      (init?.headers as Record<string, string>).Authorization,
    ).toBe('Bearer k');
  });

  it('throws when API returns non-2xx', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('nope', { status: 401, statusText: 'Unauthorized' }),
      );
    const client = createGivebutterClient({ apiKey: 'bad', fetch: fetchMock });
    await expect(async () => {
      for await (const _c of client.listContacts()) {
        void _c;
      }
    }).rejects.toThrow(/401/);
  });

  it('handles empty page result without erroring', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [], links: { next: null } }));
    const client = createGivebutterClient({ apiKey: 'k', fetch: fetchMock });
    const out: unknown[] = [];
    for await (const c of client.listTransactions()) out.push(c);
    expect(out).toEqual([]);
  });
});

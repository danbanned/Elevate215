const BASE_URL = 'https://api.givebutter.com/v1';

export interface GivebutterContact {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
}

export interface GivebutterTransaction {
  id: number | string;
  contact_id?: number | string | null;
  amount?: number | string | null;
  transaction_date?: string | null;
  campaign_name?: string | null;
  fund?: string | null;
  recurring?: boolean | null;
}

interface Paginated<T> {
  data: T[];
  meta?: {
    next_cursor?: string | null;
    next_page?: number | null;
  };
  links?: {
    next?: string | null;
  };
}

export interface GivebutterClient {
  listContacts(): AsyncGenerator<GivebutterContact>;
  listTransactions(): AsyncGenerator<GivebutterTransaction>;
}

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createGivebutterClient(options: ClientOptions): GivebutterClient {
  const baseUrl = options.baseUrl ?? BASE_URL;
  const fetchImpl = options.fetch ?? fetch;

  async function getPage<T>(url: string): Promise<Paginated<T>> {
    const res = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(
        `GiveButter ${url} failed: ${String(res.status)} ${res.statusText}`,
      );
    }
    return (await res.json()) as Paginated<T>;
  }

  async function* paginate<T>(path: string): AsyncGenerator<T> {
    let url: string | null = `${baseUrl}${path}`;
    while (url) {
      const page: Paginated<T> = await getPage<T>(url);
      for (const item of page.data) yield item;
      const next = page.links?.next ?? null;
      url = next && next.startsWith('http') ? next : null;
    }
  }

  return {
    listContacts: () => paginate<GivebutterContact>('/contacts'),
    listTransactions: () => paginate<GivebutterTransaction>('/transactions'),
  };
}

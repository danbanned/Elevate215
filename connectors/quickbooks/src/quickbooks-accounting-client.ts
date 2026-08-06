import { loadEnv } from '@lp-ai/lib-config';

import { getQuickBooksAccessToken, quickBooksRequest, QUICKBOOKS_SANDBOX_API_BASE_URL } from './quickbooks-client.js';

const MINOR_VERSION = '65';

async function apiBaseUrl(): Promise<string> {
  const env = await loadEnv();
  return env.QUICKBOOKS_API_BASE_URL || QUICKBOOKS_SANDBOX_API_BASE_URL;
}

async function accountingApiGet(realmId: string, path: string, query: Record<string, string> = {}): Promise<unknown> {
  const accessToken = await getQuickBooksAccessToken(realmId);
  const baseUrl = await apiBaseUrl();
  const params = new URLSearchParams({ minorversion: MINOR_VERSION, ...query });
  const url = `${baseUrl}/v3/company/${realmId}/${path}?${params.toString()}`;

  const response = await quickBooksRequest(url, {
    realmId,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  return response.json();
}

/** GET /v3/company/{realmId}/companyinfo/{realmId} — simplest possible smoke test of a real data call. */
export async function fetchCompanyInfo(realmId: string): Promise<unknown> {
  return accountingApiGet(realmId, `companyinfo/${realmId}`);
}

export interface ProfitAndLossOptions {
  /** YYYY-MM-DD. Defaults to QuickBooks' own report default (current fiscal year to date) if omitted. */
  startDate?: string;
  /** YYYY-MM-DD. Defaults to QuickBooks' own report default if omitted. */
  endDate?: string;
  /**
   * Confirmed working against live sandbox data with 'Year' + an explicit
   * multi-year startDate/endDate range: returns one Money column per
   * period (e.g. "Jan - Dec 2024", "Jan - Dec 2025", ...) plus a final
   * Total column, with every row's ColData positionally aligned to
   * Columns.Column. Omit for the default flat single-Total-column report.
   */
  summarizeColumnBy?: 'Month' | 'Quarter' | 'Year';
}

/** GET /v3/company/{realmId}/reports/ProfitAndLoss */
export async function fetchProfitAndLoss(realmId: string, options: ProfitAndLossOptions = {}): Promise<unknown> {
  const query: Record<string, string> = {};
  if (options.startDate) query['start_date'] = options.startDate;
  if (options.endDate) query['end_date'] = options.endDate;
  if (options.summarizeColumnBy) query['summarize_column_by'] = options.summarizeColumnBy;
  return accountingApiGet(realmId, 'reports/ProfitAndLoss', query);
}

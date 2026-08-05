/**
 * QuickBooks-specific error logging — one consistent structured entry
 * (realmId, endpoint, intuit_tid, status, QuickBooks error code/detail)
 * regardless of whether the error came from the auth layer or a data call.
 *
 * Intentionally decoupled from *where* the log ends up: defaults to
 * structured console output. Whether this should move to a dedicated,
 * queryable table (e.g. a Prisma model) instead of console output is still
 * an open decision — not made here. Swap the `sink` argument for a Prisma
 * insert at the call site once that's decided; nothing else needs to change.
 */

import { QuickBooksApiError, QuickBooksTransientError, type QuickBooksError } from './errors.js';

export interface QuickBooksErrorLogEntry {
  timestamp: string; // ISO 8601
  realmId?: string | undefined;
  endpoint?: string | undefined;
  intuitTid?: string | undefined;
  statusCode?: number | undefined;
  errorCode?: string | undefined;
  errorType: string; // error.name, e.g. "QuickBooksValidationError"
  message: string;
  detail?: string | undefined;
  retryable?: boolean | undefined;
}

export type QuickBooksErrorLogSink = (entry: QuickBooksErrorLogEntry) => void | Promise<void>;

const defaultSink: QuickBooksErrorLogSink = (entry) => {
  console.error('[quickbooks-error]', JSON.stringify(entry));
};

/**
 * Logs any QuickBooks error (auth or API-level) in a consistent, structured
 * shape. This is what makes a failure "here's the exact request, here's the
 * intuit_tid, please look it up" instead of "something failed sometime
 * yesterday" — intuit_tid specifically exists so Intuit's own support team
 * can look up a failed request instantly.
 */
export async function logQuickBooksError(
  error: QuickBooksError,
  sink: QuickBooksErrorLogSink = defaultSink,
): Promise<void> {
  const isApiError = error instanceof QuickBooksApiError;

  const entry: QuickBooksErrorLogEntry = {
    timestamp: new Date().toISOString(),
    realmId: error.realmId,
    endpoint: isApiError ? error.endpoint : undefined,
    intuitTid: error.intuitTid,
    statusCode: isApiError ? error.statusCode : undefined,
    errorCode: isApiError ? error.errors[0]?.code : undefined,
    errorType: error.name,
    message: error.message,
    detail: isApiError ? error.errors[0]?.detail : undefined,
    retryable: error instanceof QuickBooksTransientError ? error.retryable : undefined,
  };

  await sink(entry);
}

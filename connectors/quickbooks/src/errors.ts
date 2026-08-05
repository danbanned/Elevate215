export class QuickBooksNotConnectedError extends Error {
  constructor(public readonly realmId: string, public readonly intuitTid?: string | undefined) {
    super(
      `No QuickBooks connection found for realmId ${realmId} — the OAuth connect flow ` +
      'has not been completed for this company (or the credential row is missing/broken).',
    );
    this.name = 'QuickBooksNotConnectedError';
  }
}

export class QuickBooksReauthRequiredError extends Error {
  constructor(
    public readonly realmId: string,
    detail?: string,
    public readonly intuitTid?: string | undefined,
  ) {
    super(
      `QuickBooks rejected the refresh token for realmId ${realmId} — reauthorization required ` +
      `(the refresh token has expired or been revoked).${detail ? ` Detail: ${detail}` : ''}`,
    );
    this.name = 'QuickBooksReauthRequiredError';
  }
}

// ---------------------------------------------------------------------------
// API-level errors (Phase 2 data calls) — distinguishes malformed/invalid
// requests and transient upstream failures from the auth failures above.
// Both auth errors and this hierarchy carry an optional intuitTid so every
// QuickBooks error type can be logged the same way (see quickbooks-error-logging.ts).
// ---------------------------------------------------------------------------

/** A single error entry as returned in QuickBooks' Fault.Error[] response body. */
export interface QuickBooksApiErrorDetail {
  /** QuickBooks' numeric error code (e.g. "6240" for a validation fault). */
  code?: string | undefined;
  message?: string | undefined;
  detail?: string | undefined;
  /** "ValidationFault" | "AuthenticationFault" | "AuthorizationFault" | "SystemFault", etc. */
  faultType?: string | undefined;
}

/** Shared diagnostic context attached to API-level errors and their log entries. */
export interface QuickBooksErrorContext {
  /** The QuickBooks company (Realm ID) the request was made against. */
  realmId?: string | undefined;
  /** The API endpoint/path that was called (e.g. "/v3/company/{realmId}/query"). */
  endpoint?: string | undefined;
  /** Intuit's per-request tracing ID (`intuit_tid` response header). */
  intuitTid?: string | undefined;
}

/**
 * Base class for errors returned by QuickBooks' *data* endpoints (as opposed
 * to the OAuth token endpoints, which use the auth-layer errors above).
 * Always carries the HTTP status and QuickBooks' own error detail so it's
 * immediately distinguishable from a connection/auth problem.
 */
export class QuickBooksApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly errors: QuickBooksApiErrorDetail[] = [],
    public readonly realmId?: string | undefined,
    public readonly endpoint?: string | undefined,
    public readonly intuitTid?: string | undefined,
  ) {
    super(message);
    this.name = 'QuickBooksApiError';
  }
}

/**
 * A 4xx response where QuickBooks rejected the request itself — malformed
 * report request, invalid date range, bad account reference, unsupported
 * field, etc. Distinct from auth failures: the credential is fine, the
 * *request* is not.
 */
export class QuickBooksValidationError extends QuickBooksApiError {
  constructor(
    message: string,
    statusCode: number,
    errors: QuickBooksApiErrorDetail[] = [],
    realmId?: string | undefined,
    endpoint?: string | undefined,
    intuitTid?: string | undefined,
  ) {
    super(message, statusCode, errors, realmId, endpoint, intuitTid);
    this.name = 'QuickBooksValidationError';
  }
}

/**
 * A 5xx response, or a 429 rate-limit — QuickBooks' side failed or throttled
 * the request. Distinct from validation errors: retrying the same request
 * later may succeed, whereas retrying a validation error never will.
 */
export class QuickBooksTransientError extends QuickBooksApiError {
  readonly retryable: boolean;

  constructor(
    message: string,
    statusCode: number,
    errors: QuickBooksApiErrorDetail[] = [],
    realmId?: string | undefined,
    endpoint?: string | undefined,
    intuitTid?: string | undefined,
  ) {
    super(message, statusCode, errors, realmId, endpoint, intuitTid);
    this.name = 'QuickBooksTransientError';
    this.retryable = statusCode === 429 || statusCode >= 500;
  }
}

/** Any QuickBooks-specific error this connector can throw — see quickbooks-error-logging.ts. */
export type QuickBooksError =
  | QuickBooksNotConnectedError
  | QuickBooksReauthRequiredError
  | QuickBooksApiError;

export function isQuickBooksError(err: unknown): err is QuickBooksError {
  return (
    err instanceof QuickBooksNotConnectedError ||
    err instanceof QuickBooksReauthRequiredError ||
    err instanceof QuickBooksApiError
  );
}

/**
 * Classifies a QuickBooks *data*-API HTTP response into the correct error
 * type. Call this from the shared request wrapper (see quickBooksRequest in
 * quickbooks-client.ts) whenever a data-call response is not ok. Not used
 * for the OAuth token endpoint — that has its own error body shape and its
 * own invalid_grant → QuickBooksReauthRequiredError special case, handled at
 * the call site via quickBooksRequest's `classifyError` override.
 */
export function classifyQuickBooksApiError(
  statusCode: number,
  body: unknown,
  context: QuickBooksErrorContext = {},
): QuickBooksApiError {
  const errors = extractErrorDetails(body);
  const message = errors[0]?.message ?? `QuickBooks API request failed with status ${statusCode}`;
  const { realmId, endpoint, intuitTid } = context;

  if (statusCode === 401 || statusCode === 403) {
    // Shouldn't normally happen if the auth layer already validated the
    // token, but if QuickBooks itself rejects it mid-request (e.g. revoked
    // while in flight), surface it as a bare QuickBooksApiError rather than
    // folding it into "the request was malformed" (Validation) or "try
    // again" (Transient) — neither framing fits an auth rejection from a
    // data-call response.
    return new QuickBooksApiError(message, statusCode, errors, realmId, endpoint, intuitTid);
  }

  if (statusCode === 429 || statusCode >= 500) {
    return new QuickBooksTransientError(message, statusCode, errors, realmId, endpoint, intuitTid);
  }

  // 400, 404, and other 4xx: treat as validation/request-shape problems.
  return new QuickBooksValidationError(message, statusCode, errors, realmId, endpoint, intuitTid);
}

function extractErrorDetails(body: unknown): QuickBooksApiErrorDetail[] {
  // QuickBooks data-API error bodies look like:
  // { "Fault": { "Error": [ { "Message": "...", "Detail": "...", "code": "6240" } ], "type": "ValidationFault" } }
  const fault = (body as { Fault?: { Error?: unknown[]; type?: string } } | undefined)?.Fault;
  if (!fault?.Error) return [];
  return (fault.Error as Array<{ code?: string; Message?: string; Detail?: string }>).map((e) => ({
    code: e.code,
    message: e.Message,
    detail: e.Detail,
    faultType: fault.type,
  }));
}

import { describe, it, expect } from 'vitest';

import { classifyQuickBooksApiError, QuickBooksValidationError, QuickBooksTransientError } from './errors.js';

const faultBody = (message: string, code: string, type: string): unknown => ({
  Fault: { Error: [{ Message: message, code }], type },
});

describe('classifyQuickBooksApiError', () => {
  it('classifies a 400 as a QuickBooksValidationError', () => {
    const error = classifyQuickBooksApiError(400, faultBody('Invalid date range', '6240', 'ValidationFault'), {});

    expect(error).toBeInstanceOf(QuickBooksValidationError);
    expect(error.statusCode).toBe(400);
    expect(error.errors[0]?.code).toBe('6240');
    expect(error.message).toBe('Invalid date range');
  });

  it('classifies a 404 as a QuickBooksValidationError', () => {
    const error = classifyQuickBooksApiError(404, faultBody('Object Not Found', '610', 'ValidationFault'), {});

    expect(error).toBeInstanceOf(QuickBooksValidationError);
    expect(error.statusCode).toBe(404);
  });

  it('classifies a 429 as a retryable QuickBooksTransientError', () => {
    const error = classifyQuickBooksApiError(429, undefined, {});

    expect(error).toBeInstanceOf(QuickBooksTransientError);
    expect(error.statusCode).toBe(429);
    expect((error as QuickBooksTransientError).retryable).toBe(true);
  });

  it('classifies a 500 as a retryable QuickBooksTransientError', () => {
    const error = classifyQuickBooksApiError(500, faultBody('Internal Server Error', '', 'SystemFault'), {});

    expect(error).toBeInstanceOf(QuickBooksTransientError);
    expect((error as QuickBooksTransientError).retryable).toBe(true);
  });

  it('classifies a 503 as a retryable QuickBooksTransientError', () => {
    const error = classifyQuickBooksApiError(503, undefined, {});

    expect(error).toBeInstanceOf(QuickBooksTransientError);
    expect((error as QuickBooksTransientError).retryable).toBe(true);
  });

  it('attaches realmId, endpoint, and intuitTid from the context', () => {
    const error = classifyQuickBooksApiError(400, faultBody('Bad request', '1000', 'ValidationFault'), {
      realmId: '123',
      endpoint: '/v3/company/123/query',
      intuitTid: 'tid-abc',
    });

    expect(error.realmId).toBe('123');
    expect(error.endpoint).toBe('/v3/company/123/query');
    expect(error.intuitTid).toBe('tid-abc');
  });

  it('falls back to a generic message when the response has no Fault body', () => {
    const error = classifyQuickBooksApiError(400, undefined, {});

    expect(error.message).toBe('QuickBooks API request failed with status 400');
    expect(error.errors).toEqual([]);
  });
});

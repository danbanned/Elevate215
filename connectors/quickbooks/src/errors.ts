export class QuickBooksNotConnectedError extends Error {
  constructor(public readonly realmId: string) {
    super(
      `No QuickBooks connection found for realmId ${realmId} — the OAuth connect flow ` +
      'has not been completed for this company (or the credential row is missing/broken).',
    );
    this.name = 'QuickBooksNotConnectedError';
  }
}

export class QuickBooksReauthRequiredError extends Error {
  constructor(public readonly realmId: string, detail?: string) {
    super(
      `QuickBooks rejected the refresh token for realmId ${realmId} — reauthorization required ` +
      `(the refresh token has expired or been revoked).${detail ? ` Detail: ${detail}` : ''}`,
    );
    this.name = 'QuickBooksReauthRequiredError';
  }
}

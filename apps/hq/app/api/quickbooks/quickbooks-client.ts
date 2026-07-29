import { prisma } from '@lp-ai/lib-db';

export interface SaveQuickBooksCredentialsInput {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds, per Intuit's token response (`expires_in`)
}

export async function saveQuickBooksCredentials(input: SaveQuickBooksCredentialsInput): Promise<void> {
  const expiresAt = new Date(Date.now() + input.expiresIn * 1000);
  await prisma.connectorCredential.upsert({
    where: {
      connector_externalAccountId: {
        connector: 'quickbooks',
        externalAccountId: input.realmId,
      },
    },
    create: {
      connector: 'quickbooks',
      externalAccountId: input.realmId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
    },
    update: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt,
    },
  });
}

export async function getQuickBooksAccessToken(realmId: string): Promise<string> {
  const credential = await prisma.connectorCredential.findUnique({
    where: {
      connector_externalAccountId: {
        connector: 'quickbooks',
        externalAccountId: realmId,
      },
    },
  });
  if (!credential) {
    throw new Error(`No stored QuickBooks credential for realmId ${realmId}`);
  }

  if (credential.expiresAt.getTime() > Date.now() + 60_000) {
    return credential.accessToken;
  }

  // TODO: access token expired — POST grant_type=refresh_token to
  // https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer with
  // credential.refreshToken, then saveQuickBooksCredentials() with the
  // response (Intuit rotates the refresh token on every use, so persist
  // both), and return the new access_token.
  throw new Error(`QuickBooks access token for realmId ${realmId} is expired; refresh is not yet implemented`);
}

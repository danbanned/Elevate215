import { loadEnv } from '@lp-ai/lib-config';
import { prisma, runSync, type SyncRunRecord } from '@lp-ai/lib-db';

import {
  createGivebutterClient,
  type GivebutterClient,
  type GivebutterContact,
  type GivebutterTransaction,
} from './client.js';

export type SyncResult = SyncRunRecord;

export interface SyncOptions {
  client?: GivebutterClient;
}

export async function sync(options: SyncOptions = {}): Promise<SyncResult> {
  return runSync('givebutter', async () => {
    const env = await loadEnv();
    const apiKey = env.GIVEBUTTER_API_KEY;

    if (!apiKey && !options.client) {
      return {
        status: 'noop',
        recordsUpserted: 0,
        notes: 'GIVEBUTTER_API_KEY not set; skipping sync.',
      };
    }

    const client = options.client ?? createGivebutterClient({ apiKey: apiKey! });
    let contactsUpserted = 0;
    let giftsUpserted = 0;
    const contactIdMap = new Map<string, string>();

    for await (const contact of client.listContacts()) {
      const gbId = String(contact.id);
      const existing = await prisma.donorContact.findFirst({
        where: { givebutterContactId: gbId },
      });
      const data = {
        givebutterContactId: gbId,
        firstName: contact.first_name ?? null,
        lastName: contact.last_name ?? null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
        organizationName: contact.company ?? null,
        syncedAt: new Date(),
      };
      const row = existing
        ? await prisma.donorContact.update({ where: { id: existing.id }, data })
        : await prisma.donorContact.create({ data });
      contactIdMap.set(gbId, row.id);
      contactsUpserted += 1;
    }

    for await (const tx of client.listTransactions()) {
      const gbId = String(tx.id);
      const contactPk =
        tx.contact_id != null ? contactIdMap.get(String(tx.contact_id)) : null;
      const amount =
        typeof tx.amount === 'number'
          ? tx.amount
          : tx.amount != null
            ? Number.parseFloat(tx.amount)
            : 0;
      const data = {
        givebutterTxId: gbId,
        donorContactId: contactPk ?? null,
        amount: Number.isFinite(amount) ? amount : 0,
        giftDate: tx.transaction_date ?? '',
        campaignName: tx.campaign_name ?? null,
        fund: tx.fund ?? null,
        isRecurring: tx.recurring ?? false,
        syncedAt: new Date(),
      };
      const existing = await prisma.donorGift.findFirst({
        where: { givebutterTxId: gbId },
      });
      if (existing) {
        await prisma.donorGift.update({ where: { id: existing.id }, data });
      } else {
        await prisma.donorGift.create({ data });
      }
      giftsUpserted += 1;
    }

    const total = contactsUpserted + giftsUpserted;
    return {
      status: total > 0 ? 'ok' : 'noop',
      recordsUpserted: total,
      notes: `contacts=${contactsUpserted.toString()} gifts=${giftsUpserted.toString()}`,
    };
  }, {
    tables: ['donor_contacts', 'donor_gifts', 'donor_pipeline'],
  });
}

export { createGivebutterClient } from './client.js';
export type {
  GivebutterClient,
  GivebutterContact,
  GivebutterTransaction,
} from './client.js';

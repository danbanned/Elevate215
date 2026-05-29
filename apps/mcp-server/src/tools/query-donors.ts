import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { prisma } from '@lp-ai/lib-db';
import type { Prisma } from '@lp-ai/lib-db';

import { runTool, parseStr } from '../tool-helpers.js';
import { toolError } from '../errors.js';

const NAME = 'query_donors';

const DESCRIPTION =
  "Look up Building21 donors and donor relationships from the Development CRM. Use for questions about specific donors ('what has Vanguard given'), donor population breakdowns ('how many active foundations'), or pulling a complete donor profile (gifts, pipeline, grants). Defaults to Launchpad-only data — set launchpad_only=false to see all B21 development data. For aggregate finance views (total raised, pipeline value by month, etc.), use query_finances with the dev_* query types instead.";

const inputSchema = {
  query_type: z.enum(['list', 'profile', 'summary']),
  donor_name: z.string().optional(),
  donor_type: z.string().optional(),
  status: z.string().optional(),
  launchpad_only: z.boolean().optional(),
};

export function registerQueryDonors(server: McpServer): void {
  server.registerTool(NAME, { description: DESCRIPTION, inputSchema }, (input) =>
    runTool(NAME, input, async () => {
      const raw = input as Record<string, unknown>;
      const queryType = parseStr(raw, 'query_type') ?? 'list';
      const donorName = parseStr(raw, 'donor_name');

      if (queryType === 'summary') {
        const totalDonors = await prisma.donorContact.count();
        const aggregate = await prisma.donorGift.aggregate({
          _sum: { amount: true },
          _count: { _all: true },
        });
        return {
          query_type: 'summary',
          total_donors: totalDonors,
          lifetime_giving: {
            total: aggregate._sum.amount ?? 0,
            contributing_gifts: aggregate._count._all,
          },
        };
      }

      if (queryType === 'profile') {
        if (!donorName) {
          return toolError('entity_not_found', 'donor_name is required for profile.');
        }
        const matches = await prisma.donorContact.findMany({
          where: {
            OR: [
              { firstName: { contains: donorName, mode: 'insensitive' } },
              { lastName: { contains: donorName, mode: 'insensitive' } },
              { organizationName: { contains: donorName, mode: 'insensitive' } },
            ],
          },
          take: 5,
        });
        if (matches.length === 0) {
          return toolError('no_records', `No donor matched '${donorName}'.`);
        }
        if (matches.length > 1) {
          return {
            query_type: 'profile',
            ambiguous: true,
            candidates: matches.map((m) => ({
              id: m.id,
              first_name: m.firstName,
              last_name: m.lastName,
              organization_name: m.organizationName,
              email: m.email,
            })),
          };
        }
        const [donor] = matches;
        if (!donor) {
          return toolError('no_records', `No donor matched '${donorName}'.`);
        }
        const [gifts, pipeline] = await Promise.all([
          prisma.donorGift.findMany({
            where: { donorContactId: donor.id },
            orderBy: { giftDate: 'desc' },
          }),
          prisma.donorPipeline.findMany({ where: { donorContactId: donor.id } }),
        ]);
        return {
          query_type: 'profile',
          matched_name:
            donor.organizationName ??
            `${donor.firstName ?? ''} ${donor.lastName ?? ''}`.trim(),
          contact_id: donor.id,
          profile: {
            id: donor.id,
            first_name: donor.firstName,
            last_name: donor.lastName,
            organization_name: donor.organizationName,
            email: donor.email,
            phone: donor.phone,
          },
          giving_history: gifts.map((g) => ({
            amount: g.amount,
            gift_date: g.giftDate,
            campaign_name: g.campaignName,
            fund: g.fund,
            is_recurring: g.isRecurring,
          })),
          prospect_pipeline: pipeline.map((p) => ({
            stage: p.stage,
            ask_amount: p.askAmount,
            likelihood: p.likelihood,
            notes: p.notes,
          })),
        };
      }

      const where: Prisma.DonorContactWhereInput = {};
      if (donorName) {
        where.OR = [
          { firstName: { contains: donorName, mode: 'insensitive' } },
          { lastName: { contains: donorName, mode: 'insensitive' } },
          { organizationName: { contains: donorName, mode: 'insensitive' } },
        ];
      }
      const rows = await prisma.donorContact.findMany({
        where,
        orderBy: [{ organizationName: 'asc' }, { lastName: 'asc' }],
        take: 500,
      });
      return {
        query_type: 'list',
        record_count: rows.length,
        donors: rows.map((d) => ({
          id: d.id,
          first_name: d.firstName,
          last_name: d.lastName,
          organization_name: d.organizationName,
          email: d.email,
        })),
      };
    }),
  );
}

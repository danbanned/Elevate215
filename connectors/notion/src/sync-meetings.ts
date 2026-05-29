import crypto from 'node:crypto';
import { prisma } from '@lp-ai/lib-db';
import { embedBatch } from '@lp-ai/lib-embedding';
import { getPage, queryDatabase } from './notion-client.js';
import { walkPageBlocks } from './block-walker.js';
import { chunkText } from './chunker.js';

interface NotionProperty {
  id?: string;
  type: string;
  [key: string]: unknown;
}

interface NotionPage {
  id: string;
  last_edited_time: string;
  archived?: boolean;
  properties: Record<string, NotionProperty>;
}

interface ExtractedMeta {
  title: string;
  meeting_date: string | null;
  visibility: string[];
  attendees: string[];
  owner: string | null;
  project: string[];
  tags: string[];
  meeting_type: string | null;
  recording_url: string | null;
}

function richTextToPlain(rt: unknown): string {
  if (!Array.isArray(rt)) return '';
  return rt.map((r: unknown) => {
    const item = r as { plain_text?: string };
    return item.plain_text ?? '';
  }).join('');
}

function extractTitle(props: Record<string, NotionProperty>): string {
  for (const p of Object.values(props)) {
    if (p.type === 'title') {
      return richTextToPlain((p as { title?: unknown }).title).trim();
    }
  }
  return '';
}

function extractMultiSelect(prop: NotionProperty | undefined): string[] {
  if (!prop || prop.type !== 'multi_select') return [];
  const arr = (prop as { multi_select?: Array<{ name?: string }> }).multi_select;
  return (arr ?? []).map((s) => s.name ?? '').filter(Boolean);
}

function extractSelect(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== 'select') return null;
  return (prop as { select?: { name?: string } }).select?.name ?? null;
}

function extractDate(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== 'date') return null;
  return (prop as { date?: { start?: string } }).date?.start ?? null;
}

function extractUrl(prop: NotionProperty | undefined): string | null {
  if (!prop || prop.type !== 'url') return null;
  return (prop as { url?: string }).url ?? null;
}

function extractPeopleOrMultiSelect(prop: NotionProperty | undefined): string[] {
  if (!prop) return [];
  if (prop.type === 'people') {
    const arr = (prop as { people?: Array<{ name?: string }> }).people;
    return (arr ?? []).map((p) => p.name ?? '').filter(Boolean);
  }
  if (prop.type === 'multi_select') {
    return extractMultiSelect(prop);
  }
  return [];
}

function extractSinglePerson(prop: NotionProperty | undefined): string | null {
  if (!prop) return null;
  if (prop.type === 'people') {
    const arr = (prop as { people?: Array<{ name?: string }> }).people;
    return arr?.[0]?.name ?? null;
  }
  return extractSelect(prop);
}

function extractRelationOrMultiSelect(prop: NotionProperty | undefined): string[] {
  if (!prop) return [];
  if (prop.type === 'multi_select') return extractMultiSelect(prop);
  if (prop.type === 'relation') {
    const arr = (prop as { relation?: Array<{ id?: string }> }).relation;
    return (arr ?? []).map((r) => r.id ?? '').filter(Boolean);
  }
  return [];
}

function extractMeta(page: NotionPage): ExtractedMeta {
  const props = page.properties;
  return {
    title: extractTitle(props),
    meeting_date: extractDate(props['Date']),
    visibility: extractMultiSelect(props['Visibility']),
    attendees: extractPeopleOrMultiSelect(props['Attendees']),
    owner: extractSinglePerson(props['Owner']),
    project: extractRelationOrMultiSelect(props['Project']),
    tags: extractMultiSelect(props['Tags']),
    meeting_type: extractSelect(props['Type']),
    recording_url: extractUrl(props['URL']),
  };
}

interface SyncStats {
  pages_discovered: number;
  pages_skipped_no_visibility: number;
  pages_skipped_archived: number;
  pages_skipped_error: number;
  pages_synced: number;
  chunks_written: number;
}

export async function syncMeetings(opts?: { incrementalSince?: Date }): Promise<SyncStats> {
  const databaseId = process.env['NOTION_MEETING_TRANSCRIPTS_DB_ID'];
  if (!databaseId) {
    throw new Error('NOTION_MEETING_TRANSCRIPTS_DB_ID not set');
  }

  const stats: SyncStats = {
    pages_discovered: 0,
    pages_skipped_no_visibility: 0,
    pages_skipped_archived: 0,
    pages_skipped_error: 0,
    pages_synced: 0,
    chunks_written: 0,
  };

  const filter = opts?.incrementalSince
    ? {
        timestamp: 'last_edited_time',
        last_edited_time: { on_or_after: opts.incrementalSince.toISOString() },
      }
    : undefined;

  for await (const page of queryDatabase<NotionPage>(databaseId, filter)) {
    stats.pages_discovered += 1;

    if (page.archived) {
      stats.pages_skipped_archived += 1;
      continue;
    }

    const meta = extractMeta(page);
    if (meta.visibility.length === 0) {
      stats.pages_skipped_no_visibility += 1;
      console.warn(`  skipping page ${page.id} ("${meta.title || '<untitled>'}"): no Visibility tag`);
      continue;
    }

    try {
      const written = await syncOnePage(databaseId, page, meta);
      stats.chunks_written += written;
      stats.pages_synced += 1;
    } catch (err) {
      stats.pages_skipped_error += 1;
      console.error(`  failed page ${page.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return stats;
}

async function syncOnePage(
  databaseId: string,
  page: NotionPage,
  meta: ExtractedMeta,
): Promise<number> {
  const bodyText = await walkPageBlocks(page.id);
  if (!bodyText.trim()) return 0;

  const headerLines = [
    meta.title ? `# ${meta.title}` : null,
    meta.meeting_date ? `Date: ${meta.meeting_date}` : null,
    meta.meeting_type ? `Type: ${meta.meeting_type}` : null,
    meta.attendees.length ? `Attendees: ${meta.attendees.join(', ')}` : null,
    meta.owner ? `Owner: ${meta.owner}` : null,
  ].filter((l): l is string => !!l);
  const fullText = [...headerLines, '', bodyText].join('\n');

  const chunks = chunkText(fullText);
  if (chunks.length === 0) return 0;

  const embeddings = await embedBatch(chunks);

  await prisma.$executeRaw`
    DELETE FROM document_chunks
    WHERE source = 'notion'
      AND source_id LIKE ${'notion:' + page.id + ':%'}
  `;

  for (let i = 0; i < chunks.length; i += 1) {
    const id = crypto.randomUUID();
    const sourceId = `notion:${page.id}:${i}`;
    const content = chunks[i]!;
    const embedding = embeddings[i]!;
    const embeddingLiteral = `[${embedding.join(',')}]`;
    const metadata = {
      subtype: 'meeting',
      notion_page_id: page.id,
      notion_database_id: databaseId,
      last_edited_time: page.last_edited_time,
      meeting_date: meta.meeting_date,
      meeting_type: meta.meeting_type,
      attendees: meta.attendees,
      owner: meta.owner,
      project: meta.project,
      tags: meta.tags,
      recording_url: meta.recording_url,
      visibility: meta.visibility,
      chunk_index: i,
      chunk_count: chunks.length,
    };
    const metadataJson = JSON.stringify(metadata);

    await prisma.$executeRaw`
      INSERT INTO document_chunks (id, source, source_id, title, content, embedding, metadata, synced_at)
      VALUES (
        ${id},
        'notion',
        ${sourceId},
        ${meta.title || null},
        ${content},
        ${embeddingLiteral}::vector(1536),
        ${metadataJson}::jsonb,
        NOW()
      )
    `;
  }

  return chunks.length;
}

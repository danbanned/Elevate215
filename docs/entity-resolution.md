# Entity Resolution

## Problem

The same person appears differently across every data source:

| Source | How a student might appear |
|---|---|
| BigQuery (attendance) | Student ID `S1042`, full name `Maria Garcia` |
| BigQuery (Beacon) | Student ID `S1042` |
| Google Drive | `Maria G.`, `Maria Garcia`, student ID in a column |
| Slack | `@maria.g`, display name `Maria 🌟` |
| Notion (meeting transcripts) | `Maria`, `Maria Garcia`, `the student we discussed` |

Without resolution, MCP tools can't answer "What's Maria's attendance?" when given a Slack handle — they don't know `@maria.g` maps to student ID `S1042`.

## Solution: Canonical Entity Table + Alias Graph

Every student and staff member has one canonical record in `students` or `staff`. Every name, handle, or ID they go by is stored as a row in `entity_aliases`, pointing back to the canonical record.

```
entity_aliases
  source: 'slack',    alias: '@maria.g'       → students.id = uuid-A
  source: 'drive',    alias: 'Maria G.'       → students.id = uuid-A
  source: 'bigquery', alias: 'S1042'          → students.id = uuid-A
  source: 'drive',    alias: 'Maria Garcia'   → students.id = uuid-A
```

MCP tools resolve any alias to a canonical entity ID before querying. The entity ID is also stored in `document_chunks.metadata` (pgvector) so vector search results can be filtered by person.

## Cold Start (Initial Seeding)

The Google Drive "Student Information for Launchpad LLMs" document is the seed source. It contains a structured table with:
- Student ID
- Full name
- Common nickname(s) (if documented)
- Email

The Google Drive connector processes this table first and creates `students` rows + `entity_aliases` rows before ingesting any narrative content.

Staff records are seeded manually from the team roster (a one-time script).

## Ongoing Resolution

When a connector encounters a name or handle not yet in `entity_aliases`:

1. **Exact match check** — look up the string exactly in `entity_aliases.alias`. If found, link to that entity.
2. **Fuzzy match** — run trigram similarity (pg_trgm) against all `alias` values for the same `entity_type`. If the best match has similarity ≥ 0.85 and is unambiguous (no second match within 0.05), auto-link with `confidence = similarity_score`.
3. **No match** — create a `pending_alias` log entry for manual review. Do not create a phantom entity.

The `confidence` column on `entity_aliases` reflects this:
- `1.00` — exact match or manually confirmed
- `0.85–0.99` — fuzzy auto-linked (high confidence)
- `< 0.85` — should not be auto-linked; requires manual review

## Manual Override

An admin can correct a bad alias link via the HQ dashboard (V0: direct DB edit; Phase 1: UI). To override:
1. Update the `entity_id` on the `entity_aliases` row
2. Set `confidence = 1.00`
3. Add a `source = 'manual'` row for the corrected mapping

## Embedding Metadata

When a connector embeds content, it attempts to resolve entity mentions in the chunk and stores the resolved `entity_ids[]` in `document_chunks.metadata` (pgvector). This allows the `search_by_person` MCP tool to filter search results by entity UUID rather than doing post-hoc name matching.

Entity mention detection for V0 is simple: exact or near-exact string match against all known aliases. NLP-based co-reference resolution is deferred to Phase 1.

## Lookup Helper (shared package)

All connectors and MCP tools use a shared function from `packages/db`:

```typescript
// Returns the canonical entity record, or null if unresolved
resolveEntity(alias: string, entityType: 'student' | 'staff'): Promise<Student | Staff | null>

// Returns all aliases for a canonical entity ID
getAliases(entityId: string): Promise<EntityAlias[]>
```

# MCP Server Spec

## Tool Availability

The server currently exposes **5 tools**, all active. Semantic search (`search_documents`) uses pgvector with OpenAI `text-embedding-3-large` embeddings (1536 dimensions), but no live connector currently populates `document_chunks` — the tool works, it just has nothing to search yet.

**Active tools (5):**
- `query_finances` — financial data from `finance_snapshots` (Aplos accounting tabs)
- `get_finance_brief` — fund balances, chart-of-accounts summary, recent transactions
- `query_school_rollup` — school-level performance/enrollment data from the PHL School Performance Model
- `search_documents` — generic pgvector semantic search over `document_chunks`
- `skill_finance_audit` — generates structured instructions for multi-view financial reports

All tools are read-only — no writes to any data source. Every tool call is logged to the `usage_logs` Postgres table (tool name, timestamp, duration, caller identity, token usage).

**Server location:** `apps/mcp-server/`
**Transport:** Streamable HTTP (production on ECS Fargate behind ALB) + stdio (Claude Desktop)

## Tool Definitions

---

### `query_finances`

Look up financial data from `finance_snapshots`. Each `query_type` maps to a data-source tab; the handler is generic and returns the raw `rowData` JSON so the caller can read whichever columns matter for the question.

**Source:** `connectors/aplos` — Aplos accounting tabs, stored as `finance_snapshots` rows with `tab_name` values like `aplos:accounts`, `aplos:funds`, `aplos:transactions`.

**Description shown to Claude:**
> Look up financial data from finance_snapshots (Aplos accounting). Each query_type maps to a data source tab. Returns the raw rowData JSON so the caller can read whichever columns matter for the question.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query_type": { "type": "string", "enum": ["aplos_accounts", "aplos_funds", "aplos_transactions"] },
    "tab_name": { "type": "string", "description": "Override tab_name match (advanced)." },
    "period": { "type": "string" },
    "contains": { "type": "string", "description": "Substring match against the JSON-serialized rowData (currently unused by the handler)." },
    "limit": { "type": "number" }
  },
  "required": ["query_type"]
}
```

**Output Schema:**
```json
{
  "query_type": "aplos_funds",
  "record_count": 42,
  "records": [
    { "source_id": "aplos:funds:12", "tab_name": "aplos:funds", "period": null, "row_data": { "...": "..." } }
  ],
  "sources": ["aplos"]
}
```

---

### `get_finance_brief`

High-level financial overview: Aplos fund balances, chart-of-accounts summary, recent transactions.

**Description shown to Claude:**
> Get a high-level financial overview of the organization: fund balances, chart-of-accounts summary, and recent transactions. Use this as a starting point for any general finance question.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "period": { "type": "string", "enum": ["ytd", "last_30_days", "last_quarter"], "default": "ytd" }
  },
  "required": []
}
```

**Output Schema:**
```json
{
  "period": "ytd",
  "aplos_funds": [ { "source_id": "...", "period": "...", "row_data": {} } ],
  "aplos_accounts_summary": { "total": 42, "by_category": { "asset": 10, "revenue": 12 } },
  "recent_transactions": [ { "source_id": "...", "period": "...", "row_data": {} } ],
  "sources_active": ["aplos"]
}
```

---

### `query_school_rollup`

School-level performance and enrollment data from the PHL School Performance Model's "School Rollup" tab (301 schools, one row each). See [docs/data-sources/school-rollup-dictionary.md](data-sources/school-rollup-dictionary.md) for full field definitions and open questions with the client.

**Source:** `connectors/google-sheets` → `school_rollup` table.

**Description shown to Claude:**
> Look up school-level performance and enrollment data from the PHL School Performance Model School Rollup tab — PSSA/Keystone proficiency, predicted-vs-actual residuals, performance bands, and charter enrollment/fill-tier data for Philadelphia public and charter schools.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "school_name": { "type": "string", "description": "Substring match (case-insensitive)." },
    "aun": { "type": "string", "description": "Exact match." },
    "school_number": { "type": "string", "description": "Exact match." },
    "district_name": { "type": "string", "description": "Substring match (case-insensitive)." },
    "school_type": { "type": "string", "enum": ["District", "Charter"] },
    "performance_band": {
      "type": "string",
      "enum": ["Above Line (5+)", "Within 5 pts", "Below Line (5+)", "Excluded (Selection Criteria)"],
      "description": "Matches if ANY of the 5 exam band columns equals this value, unless scoped by `exam`."
    },
    "exam": {
      "type": "string",
      "enum": ["pssa_reading", "pssa_math", "keystone_algebra_i", "keystone_biology", "keystone_literature"],
      "description": "Scopes performance_band to one specific exam instead of matching any of the 5."
    },
    "include_excluded": { "type": "boolean", "default": true, "description": "If false, excludes rows where excluded_selection_criteria = true." },
    "limit": { "type": "number", "default": 50, "description": "Max 200." }
  },
  "required": []
}
```

**Output Schema:**
```json
{
  "record_count": 1,
  "schools": [
    {
      "aun": "126510015", "school_number": "7825", "school_name": "AD PRIMA CS",
      "district_name": "AD PRIMA CS", "school_type": "Charter", "grade_span": "K-8",
      "pct_black_hispanic": 95.94, "pct_low_income": 92.74, "excluded_selection_criteria": false,
      "exams": {
        "pssa_reading": { "n_scored": 377, "pct_proficient": 37.4, "predicted": 17.39, "residual": 20.01, "band": "Above Line (5+)" },
        "pssa_math": { "n_scored": 378, "pct_proficient": 20.4, "predicted": 8.64, "residual": 11.76, "band": "Above Line (5+)" },
        "keystone_algebra_i": { "n_scored": null, "pct_proficient": null, "predicted": null, "residual": null, "band": null },
        "keystone_biology": { "n_scored": null, "pct_proficient": null, "predicted": null, "residual": null, "band": null },
        "keystone_literature": { "n_scored": null, "pct_proficient": null, "predicted": null, "residual": null, "band": null }
      },
      "simple_avg_residual": 15.9, "enrollment_weighted_avg_residual": 15.9,
      "above_line_count": 2, "within_5_count": 0, "below_line_count": 0, "tests_with_data": 2,
      "current_enrollment": 617, "authorized_enrollment_cap": 700, "unused_seats": 83,
      "fill_tier": "Fill-B", "eapi_tier": "EAPI-A"
    }
  ]
}
```

Note: percentages, residuals, and predicted values are on a **0–100 scale** (not 0–1) — a prior draft of this model got that wrong; it's correct now. `null` exam blocks mean the school has no data for that exam (e.g. K-8 schools have no Keystone data — Keystone is high-school-only), not a data-quality problem.

---

### `search_documents`

Generic pgvector semantic search over `document_chunks`. No live connector currently writes to this table, so results will be empty until one does (`search_documents` itself works correctly regardless).

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "Natural language search query." },
    "source": { "type": "string", "description": "Optional: restrict to a single source." },
    "top_k": { "type": "integer", "description": "Default 8, max 20." },
    "min_similarity": { "type": "number", "description": "Default 0.7." }
  },
  "required": ["query"]
}
```

**Output Schema:**
```json
{
  "query": "...",
  "result_count": 3,
  "results": [
    { "id": "uuid", "source": "...", "source_id": "...", "title": null, "content": "...", "metadata": {}, "similarity": 0.83 }
  ]
}
```

Results are filtered by an `allowed_emails` visibility rule read from each chunk's `metadata` (inherited from the original build's meeting-transcript access control) — a chunk with no `allowed_emails` key, or an explicit `null`, is visible to everyone; a chunk with a non-null array is visible only to callers whose email is in that list.

---

### `skill_finance_audit`

Returns structured instructions for Claude to follow to produce a financial report — it doesn't return data itself, it returns a prompt describing which of the other tools to call and how to assemble the result.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "report_type": { "type": "string", "enum": ["monthly_close", "audit_prep", "board_financials", "fund_reconciliation", "custom_query"] },
    "period": { "type": "string" },
    "fund_name": { "type": "string" },
    "custom_question": { "type": "string" },
    "comparison_period": { "type": "string" },
    "additional_context": { "type": "string" }
  },
  "required": ["report_type"]
}
```

**Output Schema:**
```json
{
  "skill": "skill_finance_audit",
  "note": "Follow the instructions below step by step. ...",
  "instructions": "..."
}
```

Only calls `query_finances`/`get_finance_brief` internally (via the instructions it hands back to Claude) — the donor/grant-reporting content from the original build (funder reports, cost-per-student metrics) was removed since there's no donor data model in this project.

---

## Error Response Format (All Tools)

```json
{
  "error": {
    "code": "internal_error",
    "message": "..."
  }
}
```

Error codes in use: `internal_error`, `search_failed`, `permission_denied`. Tool-specific codes (e.g. `entity_not_found`) existed in the original build for student/donor lookup tools that no longer exist here.

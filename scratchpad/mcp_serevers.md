# apps/mcp-server/

me:
|
The AI doesn't have direct access to tools. Instead, it asks the MCP server, which acts as a gateway to determine what tools are available and execute them safely. At the top of the system is the Supervisor Agent, which decides what needs to be done and requests the appropriate tools from the MCP server. The MCP server provides different types of tools: data tools, which retrieve information from systems like Google Drive or QuickBooks, and skill tools, which perform actions like summarizing, comparing, or transforming that data. The AI connects to the MCP server using stdio during local development (a direct connection) or HTTP when running in production. Every tool call is recorded in usage_logs for auditing, and tool_permissions control which agents are allowed to use which tools.

The AWS MCP Server is separate because it manages high-impact infrastructure tasks, such as creating or deleting databases, launching servers, deploying applications, creating AWS users, or modifying cloud storage. Instead of executing these actions immediately, it creates an aws_resource_jobs request. That request is placed in a queue and must be approved by a human through the HQ Dashboard before the AI is allowed to make any changes. This prevents the AI from accidentally performing dangerous or expensive operations.

This is just the minimum setup for our MCP server. The Supervisor Agent sits above it and decides which tools to call. The MCP server simply exposes those tools and executes them safely. We'll likely have additional MCP servers dedicated to different systems (Google Drive, QuickBooks, Bloomerang, public datasets, etc.). Those MCP servers will be responsible for pulling data from the source systems, syncing it into our database, or exposing it as tools for the AI to use." some models will be in control of embeddings and making sure our vectoir database is actually qurying the coprrect data, 

the follwoing is the structure of the current system, we want to kjeep som,e of it that fits what elavat215 needs and we will get rid of anything that doesnt align or instead of geteting rid of it we should set it aside or disconnect it entirley 

## Key Files

| File | What it does |
|---|---|
| `src/index.ts` | Entry point — stdio transport |
| `src/make-server.ts` | Registers all 16 data tools + 4 skill tools; factory function |
| `src/serve-http.ts` | HTTP server (port 8080) with StreamableHTTP transport, OAuth2 endpoints, session management |
| `src/auth.ts` | Bearer token verification — JWT for users, static `SYNC_SECRET` for services |
| `src/permissions.ts` | Role-based ACL (8 roles); reads `tool_permissions` table; 60-second cache TTL |
| `src/rate-limit.ts` | Throttles OAuth endpoints and tool calls |
| `src/tool-helpers.ts` | `runTool()` wrapper — error capture, usage logging, parsing helpers |

## src/oauth/ — OAuth2 Implementation
- `flow.ts` — Authorization code flow (authorize → Google callback → token issuance)
- `dcr.ts` — Dynamic Client Registration (OpenID Connect spec)
- `jwks.ts` — JWT key set for token signing and verification
- `pkce.ts` — PKCE (Proof Key for Code Exchange)
- `google.ts` — Google-specific OAuth2 integration
- `metadata.ts` — `/.well-known/oauth-authorization-server` and protected resource metadata endpoints

## src/tools/ — Tool Implementations (16 tools)
Each tool is a standalone file with its input schema, Prisma query, and output format.

**Student & person data:**
- `get-student-info.ts` — Full profile for one student (all tables joined)
- `query-students.ts` — Filter/list students by cohort, status, phase
- `search-by-person.ts` — Cross-source search using entity resolution
- `get-entity-brief.ts` — Short summary card for any named person

**Outcomes & program data:**
- `query-outcomes.ts`, `query-enrollment.ts`, `query-certifications.ts`
- `query-competency.ts`, `query-attendance.ts`
- `query-employment.ts`, `query-postsecondary.ts`

**Finance & donors:**
- `query-finances.ts`, `query-donors.ts`, `get-finance-brief.ts`

**Semantic search:**
- `search-documents.ts` — pgvector cosine similarity over `document_chunks`
- `search-conversations.ts` — Vector search over meeting transcripts

## src/prompts/ — MCP Skill Prompts (4 skills)
`skill_grant_writing`, `skill_grant_prospecting`, `skill_finance_audit`, `skill_board_reporting` — structured prompts that compose multiple tool calls into a workflow.

## Patterns
- Every tool call logged to `usage_logs` (tool name, duration, caller, token count)
- Role ACL checked before execution; service calls via `SYNC_SECRET` bypass ACL
- Semantic search uses OpenAI `text-embedding-3-large` (1536 dims) + pgvector
- All tool annotations set (`readOnlyHint: true`, `destructiveHint: false`) to suppress per-call prompts

# apps/hq/

Next.js 14 admin dashboard for monitoring and operating the LP Internal AI system. Shows data freshness, token usage, tool call logs, connector status, and manages MCP user access. Gated to `@launchpadphilly.org` via Google OAuth.

## Pages & Routes

| Route | What it shows |
|---|---|
| `/` | Data freshness table (row counts + last sync per table), token usage by user, recent tool calls |
| `/dashboard` | Charts — cohort completion, attendance trends, competency analytics (Recharts) |
| `/sync` | Connector run history (5 connectors × last 5 runs from `sync_runs`) |
| `/tools` | MCP tool call log — filter by tool name or error status |
| `/admin` | User management — add/promote/disable/delete MCP users; role assignments; permissions matrix |
| `/aws-jobs/[id]` | Detail view for an AWS infrastructure job |
| `/api/health` | Unauthenticated DB connectivity check |
| `/api/aws-jobs/[id]` | AWS job status API |
| `/api/notion/meeting-router/*` | Notion meeting routing endpoints |

## Key Files

| File | What it does |
|---|---|
| `auth.ts` / `auth.config.ts` | NextAuth v5 with Prisma adapter; JWT sessions; Google OAuth provider |
| `middleware.ts` | Auth guard on all routes except `/auth/signin`, `/api/auth`, `/api/health`, `/aws-jobs`, `/api/aws-jobs` |
| `app/admin/actions.ts` | Server actions: `addUser()`, `promoteUser()`, `disableUser()`, `deleteUser()` |
| `app/admin/PermissionsMatrix.tsx` | Visual role × tool permissions grid |
| `app/components/TokenUsageDateFilter.tsx` | Date range picker (7d / 30d / 90d / all-time + custom) |
| `app/dashboard/charts/` | Recharts components — AttendanceTrendChart, CohortCompletionChart, CompetencyScatterChart, CompetencyAttendanceHeatmap |
| `components/Nav.tsx` | Top nav linking all routes |
| `instrumentation.ts` / `sentry.*.config.ts` | Sentry error monitoring (client, edge, server) |
| `Dockerfile` | Multi-stage Next.js standalone build; Prisma WASM artifacts copied explicitly; non-root user |

## Patterns
- All pages use `force-dynamic` — no caching, always live data
- Raw `$queryRawUnsafe` for freshness/usage analytics with parameterized inputs
- CSP headers enforce same-origin; X-Frame-Options DENY
- Admin actions check role server-side before executing

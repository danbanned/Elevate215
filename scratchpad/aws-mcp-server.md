# apps/aws-mcp-server/

AWS-specific MCP server that exposes infrastructure management tools to Claude. Bridges AI requests to AWS operations (Terraform plan/apply/inspect) with JWT auth, audit logging, and STS credential handling. Runs on port 8081.

## Key Files

| File | What it does |
|---|---|
| `src/index.ts` | Entry point — connects via stdio transport |
| `src/make-server.ts` | Registers AWS tools (`aws_plan_resource_change`, `aws_apply_resource_change`, `aws_get_resource_state`) |
| `src/serve-http.ts` | HTTP server (port 8081) with session management, auth validation, OAuth metadata |
| `src/auth.ts` | JWT verification (Bearer tokens via JWKS) + `SYNC_SECRET` fallback for service-to-service calls |
| `src/bridge.ts` | Mirrors tools from a remote MCP HTTP server locally over stdio; auto-injects caller email for audit trail |
| `src/sts-helper.ts` | AWS STS AssumeRole — issues temporary credentials per request, not stored |
| `src/tool-helpers.ts` | `runTool()` wrapper with error handling; calls `logUsage()` after each execution |
| `src/usage-log.ts` | Writes every tool call to `usage_logs` table (tool name, duration, error, caller identity) |
| `src/errors.ts` | Standardized error envelope types |
| `src/test-flow.ts` | In-process HTTP test harness for local development |
| `src/tools/aws-resources.ts` | Core tool implementations — Terraform validated before execution; dangerous patterns blocked |
| `Dockerfile` | Multi-stage build; non-root user; health check included |

## Patterns
- Terraform runs in isolated sandboxes (`.tf-sandboxes/{jobId}`), mocked in dev
- Every tool call logged with user email, duration, and error state
- Supports both OAuth JWT tokens and static `SYNC_SECRET` for services
- STS credentials are ephemeral — issued per request

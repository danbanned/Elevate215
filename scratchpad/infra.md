# infra/

AWS infrastructure definitions — ECS task definitions, IAM policies, setup scripts, and database initialization. Nothing runs here directly; these files are applied once (IAM/scripts) or referenced by the GitHub Actions deploy workflow (ECS task defs).

## Subfolders

### ecs/ — ECS Fargate Task Definitions
JSON task definitions for each service/sync job. All run ARM64, log to CloudWatch.

| Task Definition | CPU / RAM | What it runs |
|---|---|---|
| `mcp-server-taskdef.json` | 512 / 1GB | MCP server on port 8080; health check via curl; 18 secrets injected |
| `aws-mcp-server-taskdef.json` | — | AWS-specific MCP server variant |
| `hq-taskdef.json` | — | HQ Next.js dashboard |
| `sync-google-sheets-taskdef.json` | 512 / 1GB | `node dist/cli.js` in google-sheets connector dir; 16+ sheet IDs injected |
| `sync-aplos-taskdef.json` | 256 / 512MB | `node dist/cli.js` in aplos connector dir; minimal secrets |

Secrets are pulled from AWS Secrets Manager at runtime — not baked into images.

### iam/ — IAM Policies
Role and trust policies for each principal in the system.

| File | Who it applies to | What it allows |
|---|---|---|
| `lp-ecs-execution-policy.json` | ECS execution role | Fetch secrets from Secrets Manager + KMS decrypt |
| `lp-ecs-task-policy.json` | Running containers | Read app secrets; write logs to CloudWatch |
| `lp-ecs-task-trust-policy.json` | Task role | Trust `ecs-tasks.amazonaws.com` to assume |
| `lp-sync-task-policy.json` | Sync tasks | Sync-specific permissions |
| `lp-eventbridge-invoke-ecs-policy.json` | EventBridge scheduler | Invoke ECS tasks for `lp-sync-*` task definitions |
| `lp-eventbridge-scheduler-trust-policy.json` | EventBridge role | Trust EventBridge scheduler to assume |
| `lp-github-deploy-policy.json` | GitHub Actions | Push/pull ECR images; register task defs; update ECS services |
| `lp-github-deploy-trust-policy.json` | GitHub Actions OIDC | Trust `token.actions.githubusercontent.com` to assume deploy role |

### scripts/ — One-Time Setup Scripts
- `setup-github-oidc.sh` — Creates the OIDC provider in AWS and the deploy role; idempotent

### postgres-init/ — DB Initialization SQL
- `01-extensions.sql` — Enables `vector` (pgvector) and `pg_trgm` (trigram fuzzy search) extensions on first container start

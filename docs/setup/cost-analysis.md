# AWS Cost Analysis

**Last updated:** 2026-06-11
**Region:** us-east-1
**Account:** 851725317896

---

## Summary

| Category | Monthly Cost |
|---|---:|
| ECS Fargate (always-on services) | $63.80 |
| ECS Fargate (sync tasks) | $0.12 |
| RDS PostgreSQL | $14.89 |
| Application Load Balancer | $18.40 |
| Secrets Manager | $4.40 |
| ECR | $0.50 |
| CloudWatch Logs | $0.40 |
| Lambda + EventBridge | < $0.01 |
| **Total** | **~$102.50/mo** |

---

## Service Breakdown

### 1. ECS Fargate — Always-On Services

Three services run 24/7, each with `desiredCount: 1` on ARM64 Graviton.

| Service | CPU | Memory | vCPU-hrs/mo | GB-hrs/mo |
|---|---|---|---:|---:|
| HQ Dashboard | 0.5 vCPU | 1 GB | 365 | 730 |
| MCP Server | 0.5 vCPU | 1 GB | 365 | 730 |
| AWS MCP Server | 0.25 vCPU | 0.5 GB | 182.5 | 365 |
| **Totals** | **1.25 vCPU** | **2.5 GB** | **912.5** | **1,825** |

**Fargate ARM64 pricing (us-east-1):**
- CPU: $0.03238/vCPU-hr → 912.5 × $0.03238 = **$29.55**
- Memory: $0.00356/GB-hr → 1,825 × $0.00356 = **$6.50**
- Ephemeral storage (20 GB free tier): **$0.00**

**OS surcharge (Linux/ARM):** $0.03796/vCPU-hr → 912.5 × $0.03796 = **$27.75** *(note: first 6,000 hrs/mo of vCPU-hrs may qualify for Fargate free tier if account is < 12 months old)*

**Subtotal: ~$63.80/mo**

### 2. ECS Fargate — Sync Tasks (Ephemeral)

Sync connectors run as one-off Fargate tasks triggered by EventBridge → Lambda → HTTP.

| Connector | CPU | Memory | Schedule | Est. duration | Runs/mo |
|---|---|---|---|---|---:|
| Google Sheets | 0.5 vCPU | 1 GB | Every 1 hour | ~3 min | 720 |
| GiveButter | 0.5 vCPU | 1 GB | Daily 3:00 UTC | ~2 min | 30 |
| Aplos | 0.25 vCPU | 0.5 GB | Daily 3:30 UTC | ~1 min | 30 |
| Google Drive | 0.5 vCPU | 1 GB | Every 6 hours | ~2 min | 120 |

Fargate bills per-second with a 1-minute minimum. Estimated total compute:
- Google Sheets: 720 runs × 3 min = 36 hrs at 0.5 vCPU / 1 GB
- GiveButter: 30 × 2 min = 1 hr at 0.5 vCPU / 1 GB
- Aplos: 30 × 1 min = 0.5 hr at 0.25 vCPU / 0.5 GB
- Google Drive: 120 × 2 min = 4 hrs at 0.5 vCPU / 1 GB

*Note: Sync tasks currently route through the always-on MCP server endpoint (EventBridge → Lambda → HTTP POST to MCP ALB), so the Fargate sync task definitions are provisioned but may not run as separate tasks. The compute cost is absorbed by the MCP server's always-on allocation. The numbers above represent the ceiling if separate tasks are launched.*

**Subtotal: ~$0.12/mo** (separate tasks) or **$0.00** (routed through MCP server)

### 3. RDS PostgreSQL

| Setting | Value |
|---|---|
| Instance | db.t4g.micro (2 vCPU, 1 GB RAM, burstable) |
| Engine | PostgreSQL 16.3 + pgvector |
| Storage | 20 GB gp3 |
| Multi-AZ | No |
| Backup retention | 7 days |
| Encryption | Yes (AWS-managed KMS) |

| Line item | Cost |
|---|---:|
| db.t4g.micro on-demand (730 hrs) | $12.41 |
| 20 GB gp3 storage | $2.00 |
| Backup (est. 5 GB beyond free) | $0.48 |
| **Subtotal** | **$14.89** |

### 4. Application Load Balancer

One internet-facing ALB with host-based routing to three target groups:
- `hq.launchpadinc.org` → HQ container:3000
- `mcp.launchpadinc.org` → MCP container:8080
- `aws-mcp.launchpadinc.org` → AWS MCP container:8081

| Line item | Cost |
|---|---:|
| ALB hours (730 × $0.0252) | $18.40 |
| LCU hours (negligible at current traffic) | ~$0.00 |
| **Subtotal** | **$18.40** |

### 5. Secrets Manager

11 secrets under `lp-internal/` prefix:

| Secret | Contents |
|---|---|
| `lp-internal/db` | DATABASE_URL |
| `lp-internal/anthropic` | ANTHROPIC_API_KEY |
| `lp-internal/openai` | OPENAI_API_KEY |
| `lp-internal/google` | Service account JSON + 16 Sheet IDs |
| `lp-internal/nextauth` | AUTH_SECRET, Google OAuth client ID/secret |
| `lp-internal/givebutter` | GIVEBUTTER_API_KEY |
| `lp-internal/aplos` | APLOS_CLIENT_ID, APLOS_API_KEY |
| `lp-internal/slack` | SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET |
| `lp-internal/roam` | ROAM_API_KEY, ROAM_GRAPH_NAME |
| `lp-internal/sync` | SYNC_SECRET |
| `lp-internal/sentry` | SENTRY_DSN_HQ, SENTRY_DSN_MCP |

**Cost:** 11 × $0.40 = **$4.40/mo**

### 6. ECR

4 repositories:
- `lp-internal/hq`
- `lp-internal/mcp-server`
- `lp-internal/aws-mcp-server`
- `lp-internal/sync`

**Cost:** ~$0.10/GB/mo storage. Images are ~100–200 MB each → **~$0.50/mo**

### 7. CloudWatch Logs

5+ log groups with 30-day retention:
- `/ecs/lp-internal-hq`
- `/ecs/lp-internal-mcp-server`
- `/ecs/lp-internal-aws-mcp-server`
- `/ecs/lp-sync-google-sheets`
- `/ecs/lp-sync-aplos`

**Cost:** $0.50/GB ingestion. At ~500 MB–1 GB/mo → **~$0.40/mo**

### 8. Lambda + EventBridge

- 1 Lambda function (`lp-sync-trigger`), Node 20, 128 MB, ~900 invocations/month
- 4 EventBridge rules

Both fall well within free tier. **< $0.01/mo**

---

## External API Costs (Non-AWS)

These are consumed by the application but billed outside AWS.

| Service | Usage Driver | Estimated Cost |
|---|---|---|
| OpenAI Embeddings (`text-embedding-3-large`) | Document chunk ingestion; ~50K chunks at $0.13/1M tokens | ~$1–3/mo |
| Anthropic Claude (consumer of MCP tools) | Team usage via Claude.ai / API | Varies by plan |
| Sentry | Error monitoring (free tier likely sufficient) | $0 |
| Google Workspace | Service account API calls (Sheets, Drive) | $0 (included) |
| GiveButter API | REST reads | $0 (included in platform) |
| Aplos API | REST reads | $0 (included in platform) |

---

## Cost Optimizations Already Applied

- **ARM64 Graviton** — all Fargate tasks and RDS use Graviton, ~20–30% cheaper than x86
- **db.t4g.micro** — smallest burstable RDS tier; sufficient for current data volume (~26K sheet records + 16K finance records)
- **gp3 storage** — ~20% cheaper than gp2 at baseline
- **Single AZ, no Multi-AZ** — acceptable for an internal tool
- **30-day log retention** — prevents unbounded CloudWatch growth
- **No NAT Gateway** — tasks use public IP assignment (saves ~$32/mo)
- **desiredCount: 1** — no auto-scaling overhead

## Potential Future Savings

| Optimization | Saving | Trade-off |
|---|---|---|
| Fargate Spot for sync tasks | 60–70% on sync compute | 2-min eviction notice; acceptable for batch syncs |
| Reserved capacity / Savings Plans | Up to 50% on always-on Fargate | 1-year commitment |
| Consolidate MCP + AWS MCP into one service | ~$20/mo (eliminate 0.25 vCPU task + target group) | Tighter coupling |
| Move to t4g.small if micro hits CPU credits | Not a saving today, but prevents surprise throttle | Costs $24.82/mo vs $12.41 |

## Potential Future Cost Increases

| Addition | Estimated Impact |
|---|---|
| Slack connector (high-volume channel ingestion) | +$1–5/mo OpenAI embeddings |
| n8n self-hosted (Phase 13) | +$15–25/mo (0.5 vCPU / 1 GB Fargate) |
| Metabase self-hosted (Phase 14) | +$15–25/mo (0.5 vCPU / 1 GB Fargate) |
| Athena + S3 analytics (Phase 21) | $5/TB scanned; S3 storage ~$0.023/GB |
| NAT Gateway (if private subnets adopted) | +$32/mo + $0.045/GB data processed |
| Multi-AZ RDS (if uptime SLA needed) | +$12.41/mo (doubles instance cost) |
| Auto-scaling (if traffic grows) | Variable; adds tasks at $0.04/vCPU-hr |

---

## Reference

- Task definitions: `infra/ecs/*-taskdef.json`
- IAM policies: `infra/iam/`
- Setup runbooks: `docs/setup/01-aws-baseline.md` through `docs/setup/23-mcp-oauth.md`
- AWS Fargate pricing: https://aws.amazon.com/fargate/pricing/
- RDS pricing: https://aws.amazon.com/rds/postgresql/pricing/

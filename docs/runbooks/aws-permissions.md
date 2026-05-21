# AWS Account-Level Permissions for LP Internal AI V1

**Audience:** the AWS account admin (or anyone reviewing what we plan to do in the account) and the engineer who will run the setup guides.

**Scope:** every AWS service the V1 stack touches, what permissions are needed and why, and what to *grant once* vs. what becomes a *durable runtime role*.

---

## 1. The three permission boundaries

There are three distinct identities to authorize. Conflating them is the most common cause of overly permissive accounts.

| Boundary | Who/what holds it | Lifetime | Example |
|---|---|---|---|
| **Builder IAM user** | The human running setup (Christian) | Months — only during build/maintenance | Creates roles, RDS, App Runner services |
| **Service roles** | Assumed by AWS services themselves | Permanent | RDS enhanced monitoring, EventBridge Scheduler |
| **Application runtime role** | Assumed by App Runner / ECS tasks at runtime | Permanent — actively used by running code | App Runner pulling secrets, ECS sync tasks writing logs |

The current `docs/setup/01-aws-baseline.md` assumes the builder gets `AdministratorAccess`. That's fine for the initial buildout, but the **runtime** roles should be tight from day one — they are the credentials that actually live inside the running system and would matter if compromised.

---

## 2. Per-service permission map

### 2.1 IAM (foundation — required before any other phase)

**Why:** every phase creates roles, policies, and trust relationships.

**Builder grants:**
- `IAMFullAccess` (managed), or scoped policy with: `iam:CreateRole`, `iam:DeleteRole`, `iam:AttachRolePolicy`, `iam:DetachRolePolicy`, `iam:PassRole`, `iam:GetRole`, `iam:ListRoles`, `iam:CreatePolicy`, `iam:CreateServiceLinkedRole` on `lp-*` and `rds-monitoring-role`.

**Service-linked roles** (AWS auto-creates these on first use of the service): `AWSServiceRoleForRDS`, `AWSServiceRoleForAppRunner`, `AWSServiceRoleForECS`, `AWSServiceRoleForAmazonEventBridge`.

**One-time admin actions:** enable MFA on the builder user; reset the temporary console password.

### 2.2 STS

Trivial but required: `sts:GetCallerIdentity`. Included in nearly every managed policy.

### 2.3 RDS — Postgres with pgvector (Phase 2)

**Why:** production database. Replaces the local Docker Postgres.

**Builder grants:**
- `AmazonRDSFullAccess` (managed) — `rds:CreateDBInstance`, `rds:ModifyDBInstance`, `rds:CreateDBParameterGroup` (needed to enable `pgvector` and `pg_trgm`), `rds:CreateDBSubnetGroup`, snapshots.
- `AmazonVPCFullAccess` (managed) — to create the VPC, subnets, and security groups RDS lives in. Read-only if the admin pre-provisions the VPC.
- KMS: use the AWS-managed `aws/rds` key for storage encryption to avoid needing KMS write perms.

**Service role:** `rds-monitoring-role` — trusts `monitoring.rds.amazonaws.com`, attaches `AmazonRDSEnhancedMonitoringRole` (managed). Required for Performance Insights.

### 2.4 Secrets Manager (Phase 3)

**Why:** production secrets for `DATABASE_URL`, all connector API keys (GiveButter, Aplos, Slack, Roam, OpenAI, Anthropic), NextAuth secrets, Sentry DSN. `@lp-ai/config` already has the fetch path stubbed.

**Builder grants:** `SecretsManagerReadWrite` (managed) — create/update/tag/rotate.

**KMS:** use `aws/secretsmanager` (the AWS-managed key) to avoid managing a customer-managed key.

**Runtime grant:** `secretsmanager:GetSecretValue` scoped by ARN to `arn:aws:secretsmanager:us-east-1:<account>:secret:lp-internal/*`. **The Phase 1 setup currently attaches the broader `SecretsManagerReadWrite` to the App Runner role — tighten this before going live.** See §4 below for the scoped JSON.

### 2.5 ECR — container registry (Phases 1 + 9)

**Why:** both production Docker images (`lp-internal/hq`, `lp-internal/mcp-server`) live here. App Runner pulls from ECR; engineer or CI pushes.

**Builder grants:** `AmazonEC2ContainerRegistryFullAccess` (managed).

**CI grant** (when GitHub Actions gets push rights): a dedicated IAM user or an OIDC-federated role with `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:PutImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload` scoped to the two repo ARNs.

**Runtime grant:** `AmazonEC2ContainerRegistryReadOnly` (already attached in Phase 1).

### 2.6 App Runner (Phase 9)

**Why:** hosts the HQ Next.js app and the MCP server's HTTP transport (`apps/mcp-server/src/serve-http.ts`).

**Builder grants:**
- `AWSAppRunnerFullAccess` (managed) — `apprunner:CreateService`, `UpdateService`, `DeleteService`, `CreateVpcConnector` (so App Runner can reach RDS), `CreateAutoScalingConfiguration`.
- `iam:PassRole` on `lp-app-runner-role` — **commonly missed**. Without it `AppRunnerFullAccess` alone cannot hand the role to the service at create time.

**Service role:** `lp-app-runner-role` trusts both `build.apprunner.amazonaws.com` and `tasks.apprunner.amazonaws.com`. See §4.1.

### 2.7 EventBridge — cron scheduling (Phase 10)

**Why:** schedules the seven connector syncs (`sync:sheets`, `sync:drive`, `sync:bigquery`, `sync:givebutter`, `sync:aplos`, `sync:slack`, `sync:roam`).

**Builder grants:** `AmazonEventBridgeFullAccess` (managed) — `events:PutRule`, `events:PutTargets`, `scheduler:CreateSchedule`.

**Service role:** `lp-eventbridge-invoke-role` trusts `scheduler.amazonaws.com`. The inline policy depends on the target: ECS task (most likely) vs. Lambda. See §4.3.

### 2.8 CloudWatch

**Why:** App Runner, RDS, EventBridge, and ECS write logs and metrics here by default.

**Builder grants:** `CloudWatchLogsFullAccess` + `CloudWatchFullAccess` (managed).

**Runtime grant:** if the Node code writes to a custom log group (e.g. `/lp-internal/app`), the App Runner role needs `logs:CreateLogStream` and `logs:PutLogEvents` on that log group ARN. Default App Runner-managed log groups are written via the service-linked role and need no extra permissions.

### 2.9 S3 + Athena + Glue (Phase 21 — analytics warehouse)

**Why:** Athena queries Parquet files on S3 for cross-source visualization.

**Builder grants:**
- `AmazonS3FullAccess` (managed) — for `lp-internal-warehouse`, `lp-internal-athena-results`.
- `AmazonAthenaFullAccess` (managed) — workgroup creation, query execution.
- `AWSGlueConsoleFullAccess` (managed) — Athena uses the Glue Data Catalog.

**Runtime grant** (for whichever code writes to S3 — likely an ECS sync task): scoped `s3:PutObject`, `s3:GetObject`, `s3:ListBucket` on the warehouse bucket ARN. See §4.4.

### 2.10 Self-hosted services — n8n, Metabase, Airbyte (Phases 13–15)

These run in our account but aren't managed AWS services. Most likely target is ECS Fargate behind an Application Load Balancer.

**Builder grants (one-time):** `AmazonECS_FullAccess`, `ElasticLoadBalancingFullAccess`, `AmazonRoute53FullAccess`, `AWSCertificateManagerFullAccess` (managed).

If the admin prefers a single EC2 host instead of ECS, swap ECS for `AmazonEC2FullAccess`.

### 2.11 Explicitly not needed

To preempt the obvious questions, the V1 spec **does not** require:

- **Lambda** — App Runner is the chosen compute. (Lambda is only an *option* for sync tasks in Phase 10; ECS is the default.)
- **Amazon Bedrock** — Claude is accessed via the Anthropic API directly, not Bedrock.
- **SageMaker / OpenSearch / Aurora** — pgvector on RDS replaces all of these.
- **Cognito** — NextAuth + Google handles auth.

---

## 3. The "ask the admin once" bundle

Paste-able request for the AWS account owner:

> Please attach the following AWS-managed policies to my IAM user `christian-kunkel` (or to an `lp-builders` group):
>
> - `IAMFullAccess`
> - `AmazonRDSFullAccess`
> - `AmazonVPCFullAccess`
> - `SecretsManagerReadWrite`
> - `AmazonEC2ContainerRegistryFullAccess`
> - `AWSAppRunnerFullAccess`
> - `AmazonEventBridgeFullAccess`
> - `CloudWatchLogsFullAccess`
> - `AmazonS3FullAccess`
> - `AmazonAthenaFullAccess`
> - `AWSGlueConsoleFullAccess`
> - `AmazonECS_FullAccess`, `ElasticLoadBalancingFullAccess`, `AmazonRoute53FullAccess`, `AWSCertificateManagerFullAccess` *(only if Phases 13–15 are in scope)*
>
> Plus: enable MFA on the user, confirm a console password reset on first login, and confirm the account has no SCP that blocks `us-east-1`.

`AdministratorAccess` is the lazy substitute and is what the current Phase 1 guide assumes — acceptable for the initial buildout, but tighten to the list above before handing the keys to anyone else or wiring up CI.

---

## 4. Scoped JSON policies for runtime roles

These are the policies that **must** be tight from day one — they describe what the running system can do, not what a human is allowed to set up. All policies live in [`infra/iam/`](../../infra/iam/) and use `${AWS_ACCOUNT_ID}` as a placeholder that must be substituted before applying.

### 4.1 `lp-app-runner-role` — trust policy

Trusts both App Runner build and task principals. Same as the current Phase 1 trust doc; included here for completeness.

[`infra/iam/lp-app-runner-trust-policy.json`](../../infra/iam/lp-app-runner-trust-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowAppRunnerBuildAndTasks",
      "Effect": "Allow",
      "Principal": {
        "Service": [
          "build.apprunner.amazonaws.com",
          "tasks.apprunner.amazonaws.com"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

### 4.2 `lp-app-runner-role` — task policy (replaces the broad managed policies)

This is the policy to attach to `lp-app-runner-role` **instead of** `SecretsManagerReadWrite` + `AmazonEC2ContainerRegistryReadOnly`. It scopes ECR pulls to our two repos, scopes Secrets Manager reads to `lp-internal/*`, and adds CloudWatch log writes.

[`infra/iam/lp-app-runner-task-policy.json`](../../infra/iam/lp-app-runner-task-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PullAppImagesFromECR",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "ecr:DescribeImages",
        "ecr:DescribeRepositories"
      ],
      "Resource": [
        "arn:aws:ecr:us-east-1:${AWS_ACCOUNT_ID}:repository/lp-internal/hq",
        "arn:aws:ecr:us-east-1:${AWS_ACCOUNT_ID}:repository/lp-internal/mcp-server"
      ]
    },
    {
      "Sid": "ECRAuthTokenIsAccountWide",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "ReadAppSecrets",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:${AWS_ACCOUNT_ID}:secret:lp-internal/*"
    },
    {
      "Sid": "DecryptSecretsViaSecretsManager",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com"
        }
      }
    },
    {
      "Sid": "WriteApplicationLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": [
        "arn:aws:logs:us-east-1:${AWS_ACCOUNT_ID}:log-group:/aws/apprunner/lp-hq:*",
        "arn:aws:logs:us-east-1:${AWS_ACCOUNT_ID}:log-group:/aws/apprunner/lp-mcp-server:*",
        "arn:aws:logs:us-east-1:${AWS_ACCOUNT_ID}:log-group:/lp-internal/app:*"
      ]
    }
  ]
}
```

**Notes:**
- `ecr:GetAuthorizationToken` cannot be ARN-scoped — AWS only accepts `Resource: "*"` for that action. The Sid is separated so the audit trail is clear.
- The KMS statement uses the `kms:ViaService` condition so the role can decrypt *only* keys used by Secrets Manager — even if more keys are added later, this policy doesn't grant decrypt on them.

### 4.3 `lp-eventbridge-invoke-role` — trust policy

Trusts EventBridge Scheduler with an `aws:SourceAccount` confused-deputy guard.

[`infra/iam/lp-eventbridge-scheduler-trust-policy.json`](../../infra/iam/lp-eventbridge-scheduler-trust-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowEventBridgeScheduler",
      "Effect": "Allow",
      "Principal": {
        "Service": "scheduler.amazonaws.com"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:SourceAccount": "${AWS_ACCOUNT_ID}"
        }
      }
    }
  ]
}
```

### 4.3a `lp-eventbridge-invoke-role` — ECS target policy (default Phase 10 path)

Lets Scheduler run any task definition named `lp-sync-*` on the `lp-internal` cluster, and pass exactly the two task roles required.

[`infra/iam/lp-eventbridge-invoke-ecs-policy.json`](../../infra/iam/lp-eventbridge-invoke-ecs-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "RunSyncTaskDefinitions",
      "Effect": "Allow",
      "Action": "ecs:RunTask",
      "Resource": "arn:aws:ecs:us-east-1:${AWS_ACCOUNT_ID}:task-definition/lp-sync-*:*",
      "Condition": {
        "ArnLike": {
          "ecs:cluster": "arn:aws:ecs:us-east-1:${AWS_ACCOUNT_ID}:cluster/lp-internal"
        }
      }
    },
    {
      "Sid": "PassSyncTaskRoles",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": [
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/lp-sync-task-role",
        "arn:aws:iam::${AWS_ACCOUNT_ID}:role/lp-sync-execution-role"
      ],
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "ecs-tasks.amazonaws.com"
        }
      }
    }
  ]
}
```

### 4.3b `lp-eventbridge-invoke-role` — Lambda target policy (alternative)

Use this **instead of** §4.3a if Phase 10 ends up using Lambda for sync invocations.

[`infra/iam/lp-eventbridge-invoke-lambda-policy.json`](../../infra/iam/lp-eventbridge-invoke-lambda-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeSyncLambdas",
      "Effect": "Allow",
      "Action": "lambda:InvokeFunction",
      "Resource": "arn:aws:lambda:us-east-1:${AWS_ACCOUNT_ID}:function:lp-sync-*"
    }
  ]
}
```

### 4.4 `lp-sync-task-role` — the role the sync code itself runs as

This is what each connector sync process assumes when it runs. It reads connector credentials from Secrets Manager, writes logs, and (eventually) writes Parquet exports to the analytics warehouse bucket.

[`infra/iam/lp-sync-task-policy.json`](../../infra/iam/lp-sync-task-policy.json)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ReadConnectorSecrets",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:${AWS_ACCOUNT_ID}:secret:lp-internal/*"
    },
    {
      "Sid": "DecryptSecretsViaSecretsManager",
      "Effect": "Allow",
      "Action": "kms:Decrypt",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com"
        }
      }
    },
    {
      "Sid": "WriteSyncRunLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:us-east-1:${AWS_ACCOUNT_ID}:log-group:/lp-internal/sync/*"
    },
    {
      "Sid": "WriteWarehouseExports",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl",
        "s3:AbortMultipartUpload",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::lp-internal-warehouse",
        "arn:aws:s3:::lp-internal-warehouse/*"
      ]
    }
  ]
}
```

---

## 5. How to apply these

Substitute `${AWS_ACCOUNT_ID}` (e.g. via `envsubst` or `sed`) before passing to the AWS CLI.

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# Example: create the tightened App Runner task policy and attach it
envsubst < infra/iam/lp-app-runner-task-policy.json > /tmp/lp-app-runner-task-policy.json

aws iam create-policy \
  --policy-name lp-app-runner-task-policy \
  --policy-document file:///tmp/lp-app-runner-task-policy.json

aws iam attach-role-policy \
  --role-name lp-app-runner-role \
  --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/lp-app-runner-task-policy

# Detach the broad managed policies that Phase 1 added
aws iam detach-role-policy \
  --role-name lp-app-runner-role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite

aws iam detach-role-policy \
  --role-name lp-app-runner-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

The same pattern applies to the EventBridge and sync-task policies once Phases 9–10 are reached.

---

## 6. Audit checklist before going to production

- [ ] Builder IAM user has MFA enabled.
- [ ] `lp-app-runner-role` no longer has `SecretsManagerReadWrite` attached; uses the scoped policy in §4.2.
- [ ] Secrets in Secrets Manager are all prefixed `lp-internal/` so the ARN scoping works.
- [ ] `aws:SourceAccount` condition is present on every service trust policy that supports it.
- [ ] No IAM users or roles have `*:*` on `Resource: "*"` (other than ECR auth token and KMS-conditioned decrypt).
- [ ] CloudTrail is enabled in the account so role assumption is auditable.
- [ ] Sentry alerts cover IAM-related Node SDK errors (`AccessDeniedException`).

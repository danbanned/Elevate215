# Runbook: Upload local `.env` into AWS Secrets Manager

**Goal:** Move credentials from a local (gitignored) `.env` into AWS Secrets Manager under the `lp-internal/*` naming convention used by `@lp-ai/lib-config`.

**Prerequisites:**

- AWS CLI configured (`aws sts get-caller-identity` works)
- IAM permission to create/update secrets (see § Permissions below)
- A filled `.env` in the repo root (never commit it — already in `.gitignore`)

Local apps keep using `.env` with `USE_AWS_SECRETS=false`. Production / ECS uses Secrets Manager with `USE_AWS_SECRETS=true`.

---

## Permissions required

Your IAM user needs at least:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ManageLpInternalSecrets",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:CreateSecret",
        "secretsmanager:PutSecretValue",
        "secretsmanager:UpdateSecret",
        "secretsmanager:DescribeSecret",
        "secretsmanager:GetSecretValue",
        "secretsmanager:ListSecrets",
        "secretsmanager:TagResource"
      ],
      "Resource": [
        "arn:aws:secretsmanager:us-east-1:*:secret:lp-internal/*"
      ]
    },
    {
      "Sid": "ListSecretsInAccount",
      "Effect": "Allow",
      "Action": ["secretsmanager:ListSecrets"],
      "Resource": "*"
    }
  ]
}
```

Or attach the managed policy `SecretsManagerReadWrite` for the initial buildout (see [../setup/01-aws-baseline.md](../setup/01-aws-baseline.md) and [aws-permissions.md](aws-permissions.md)).

**Current blocker (2026-07-31):** IAM user `jdani0066` in account `851725317896` gets `AccessDeniedException` on `secretsmanager:ListSecrets` / create. Ask an account admin to attach the policy above (or `SecretsManagerReadWrite`) before running the commands in this runbook.

Verify after the grant:

```bash
aws sts get-caller-identity
aws secretsmanager list-secrets --query "SecretList[?starts_with(Name, 'lp-internal')].Name" --output table
```

---

## Secret groups (must match `packages/config`)

| Secret name | Keys from `.env` |
|---|---|
| `lp-internal/db` | `DATABASE_URL` |
| `lp-internal/anthropic` | `ANTHROPIC_API_KEY` |
| `lp-internal/openai` | `OPENAI_API_KEY` |
| `lp-internal/google` | `GOOGLE_SERVICE_ACCOUNT_JSON`, sheet/Drive IDs |
| `lp-internal/nextauth` | `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` |
| `lp-internal/aplos` | `APLOS_CLIENT_ID`, `APLOS_API_KEY` |
| `lp-internal/notion` | `NOTION_API_KEY`, `NOTION_MEETING_TRANSCRIPTS_DB_ID` |
| `lp-internal/slack` | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` |
| `lp-internal/sync` | `SYNC_SECRET` |
| `lp-internal/sentry` | `SENTRY_DSN_HQ`, `SENTRY_DSN_MCP` |

Full create templates: [../setup/03-secrets-manager.md](../setup/03-secrets-manager.md).

---

## Upload `DATABASE_URL` from `.env` (most common first step)

From the repo root (Git Bash / macOS / Linux). Do **not** paste the connection string into chat or commit it.

```bash
# Read DATABASE_URL from .env without printing it
set -a
# shellcheck disable=SC1091
source <(grep -E '^DATABASE_URL=' .env | sed "s/^DATABASE_URL=['\"]\\?//;s/['\"]\\?$//" | sed 's/^/DATABASE_URL=/')
set +a

# Create (first time)
aws secretsmanager create-secret \
  --name lp-internal/db \
  --description "Postgres connection string (Neon or RDS)" \
  --secret-string "{\"DATABASE_URL\":\"${DATABASE_URL}\"}"

# Or update if it already exists
aws secretsmanager put-secret-value \
  --secret-id lp-internal/db \
  --secret-string "{\"DATABASE_URL\":\"${DATABASE_URL}\"}"
```

PowerShell alternative (Windows):

```powershell
$line = Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
$value = $line -replace "^DATABASE_URL=", "" -replace "^['\"]", "" -replace "['\"]$", ""
$json = (@{ DATABASE_URL = $value } | ConvertTo-Json -Compress)

aws secretsmanager create-secret `
  --name lp-internal/db `
  --description "Postgres connection string (Neon or RDS)" `
  --secret-string $json
```

If create fails with `ResourceExistsException`, use `put-secret-value` instead.

Verify (masks most of the string in practice — still treat output as sensitive):

```bash
aws secretsmanager get-secret-value \
  --secret-id lp-internal/db \
  --query SecretString \
  --output text
```

---

## Helper scripts

```bash
# Git Bash / macOS / Linux
./scripts/upload-env-db-secret.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\scripts\upload-env-db-secret.ps1
```

Creates or updates `lp-internal/db` from the local `.env` `DATABASE_URL`. Requires AWS CLI + Secrets Manager write access.

---

## After secrets exist

1. Keep local `.env` for day-to-day (`USE_AWS_SECRETS=false`).
2. In ECS task defs / production, set `USE_AWS_SECRETS=true` and grant the task/execution roles `secretsmanager:GetSecretValue` on `lp-internal/*` (see [aws-permissions.md](aws-permissions.md)).
3. Never commit `.env` or secret JSON files.

---

## Related

- [../setup/03-secrets-manager.md](../setup/03-secrets-manager.md)
- [credentials-checklist.md](credentials-checklist.md)
- [git-unrelated-histories.md](git-unrelated-histories.md)

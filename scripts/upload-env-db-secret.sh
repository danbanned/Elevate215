#!/usr/bin/env bash
# Upload DATABASE_URL from repo-root .env into AWS Secrets Manager (lp-internal/db).
# Usage: ./scripts/upload-env-db-secret.sh
# Requires: aws CLI, secretsmanager CreateSecret/PutSecretValue on lp-internal/*

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}. Copy .env.example and fill DATABASE_URL first." >&2
  exit 1
fi

# Extract DATABASE_URL=... stripping optional surrounding quotes
RAW="$(grep -E '^DATABASE_URL=' "${ENV_FILE}" | head -n1 | cut -d= -f2-)"
DATABASE_URL="${RAW%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
DATABASE_URL="${DATABASE_URL%\'}"
DATABASE_URL="${DATABASE_URL#\'}"

if [[ -z "${DATABASE_URL}" ]]; then
  echo "DATABASE_URL is empty in ${ENV_FILE}" >&2
  exit 1
fi

# Build JSON without echoing the URL (Node is available in this monorepo)
SECRET_JSON="$(
  DATABASE_URL="${DATABASE_URL}" node -e 'process.stdout.write(JSON.stringify({ DATABASE_URL: process.env.DATABASE_URL }))'
)"

SECRET_NAME="lp-internal/db"

if aws secretsmanager describe-secret --secret-id "${SECRET_NAME}" >/dev/null 2>&1; then
  echo "Updating existing secret ${SECRET_NAME}..."
  aws secretsmanager put-secret-value \
    --secret-id "${SECRET_NAME}" \
    --secret-string "${SECRET_JSON}" >/dev/null
  echo "Updated ${SECRET_NAME}."
else
  echo "Creating secret ${SECRET_NAME}..."
  aws secretsmanager create-secret \
    --name "${SECRET_NAME}" \
    --description "Postgres connection string (Neon or RDS)" \
    --secret-string "${SECRET_JSON}" >/dev/null
  echo "Created ${SECRET_NAME}."
fi

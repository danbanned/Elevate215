# Upload DATABASE_URL from repo-root .env into AWS Secrets Manager (lp-internal/db).
# Usage: pwsh ./scripts/upload-env-db-secret.ps1
# Requires: aws CLI, secretsmanager CreateSecret/PutSecretValue on lp-internal/*

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$EnvFile = Join-Path $Root ".env"

if (-not (Test-Path $EnvFile)) {
  Write-Error "Missing $EnvFile. Copy .env.example and fill DATABASE_URL first."
}

$line = Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) {
  Write-Error "DATABASE_URL not found in $EnvFile"
}

$value = $line -replace '^DATABASE_URL=', ''
$value = $value.Trim().Trim("'").Trim('"')
if ([string]::IsNullOrWhiteSpace($value)) {
  Write-Error "DATABASE_URL is empty in $EnvFile"
}

$secretJson = (@{ DATABASE_URL = $value } | ConvertTo-Json -Compress)
$secretName = "lp-internal/db"

$exists = $true
try {
  aws secretsmanager describe-secret --secret-id $secretName 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) { $exists = $false }
} catch {
  $exists = $false
}

if ($exists) {
  Write-Host "Updating existing secret $secretName..."
  aws secretsmanager put-secret-value --secret-id $secretName --secret-string $secretJson | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Updated $secretName."
} else {
  Write-Host "Creating secret $secretName..."
  aws secretsmanager create-secret `
    --name $secretName `
    --description "Postgres connection string (Neon or RDS)" `
    --secret-string $secretJson | Out-Null
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  Write-Host "Created $secretName."
}

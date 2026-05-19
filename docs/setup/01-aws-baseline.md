# Phase 1 — AWS Account + IAM Baseline

**Goal:** Get your IAM user configured, CLI working locally, and base service roles created so every subsequent phase can run without touching the root account.

**Prerequisites:**
- AWS account exists for Launchpad (already done)
- Admin has created your IAM user with `AdministratorAccess` and provided:
  - Access key ID + secret access key
  - Temporary console password
  - 12-digit AWS account ID
- AWS CLI installed locally (`aws --version` — install via `brew install awscli` if missing)

---

## 1. First console login + secure root account

> Skip this section if the root account is already secured by your admin.

1. Log into the AWS Console at [console.aws.amazon.com](https://console.aws.amazon.com) with your IAM user credentials
2. Reset your temporary password when prompted
3. Enable MFA on your IAM user:
   - Top-right menu → **Security credentials** → **Assign MFA device**
   - Choose **Authenticator app** → scan QR code with Authenticator app (Google Authenticator, 1Password, etc.)
   - Enter two consecutive codes to verify

---

## 2. Configure the AWS CLI locally

```bash
aws configure --profile lp-internal
```

Enter when prompted:
```
AWS Access Key ID:     <your access key ID>
AWS Secret Access Key: <your secret access key>
Default region name:   us-east-1
Default output format: json
```

Verify it works:

```bash
aws sts get-caller-identity --profile lp-internal
```

Expected output:
```json
{
  "UserId": "AIDA...",
  "Account": "123456789012",
  "Arn": "arn:aws:iam::123456789012:user/christian-kunkel"
}
```

Set as default profile for this session (add to your shell profile to make it permanent):

```bash
export AWS_PROFILE=lp-internal
```

---

## 3. Note your account ID and region

```bash
aws sts get-caller-identity --query Account --output text
```

Save this — you'll need it throughout the setup. Set it as an env var:

```bash
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export AWS_REGION=us-east-1
```

---

## 4. Create the App Runner execution role

App Runner needs an IAM role to pull images from ECR and read secrets.

```bash
# Create the trust policy document
cat > /tmp/apprunner-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
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
EOF

# Create the role
aws iam create-role \
  --role-name lp-app-runner-role \
  --assume-role-policy-document file:///tmp/apprunner-trust.json

# Attach ECR read access (to pull images)
aws iam attach-role-policy \
  --role-name lp-app-runner-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

# Attach Secrets Manager read access
aws iam attach-role-policy \
  --role-name lp-app-runner-role \
  --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
```

---

## 5. Create the RDS monitoring role

```bash
cat > /tmp/rds-trust.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "monitoring.rds.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam create-role \
  --role-name rds-monitoring-role \
  --assume-role-policy-document file:///tmp/rds-trust.json

aws iam attach-role-policy \
  --role-name rds-monitoring-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole
```

---

## 6. Create ECR repositories for app images

```bash
aws ecr create-repository --repository-name lp-internal/hq --region us-east-1
aws ecr create-repository --repository-name lp-internal/mcp-server --region us-east-1
```

---

## Verification checklist

- [ ] `aws sts get-caller-identity` returns your user ARN
- [ ] MFA enabled on your IAM user
- [ ] `lp-app-runner-role` visible in IAM → Roles
- [ ] `rds-monitoring-role` visible in IAM → Roles
- [ ] Both ECR repositories visible in ECR console

---

## Teardown

```bash
aws iam detach-role-policy --role-name lp-app-runner-role --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
aws iam detach-role-policy --role-name lp-app-runner-role --policy-arn arn:aws:iam::aws:policy/SecretsManagerReadWrite
aws iam delete-role --role-name lp-app-runner-role
aws iam detach-role-policy --role-name rds-monitoring-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole
aws iam delete-role --role-name rds-monitoring-role
aws ecr delete-repository --repository-name lp-internal/hq --force
aws ecr delete-repository --repository-name lp-internal/mcp-server --force
```

---

## Known pitfalls

- **"Unable to locate credentials"** — run `aws configure --profile lp-internal` again; check `~/.aws/credentials` exists
- **Role already exists** — safe to skip; check with `aws iam get-role --role-name lp-app-runner-role`
- **Region mismatch** — all resources must be in the same region; double-check every command uses `us-east-1`

---

**Next:** [02-rds-postgres.md](02-rds-postgres.md)

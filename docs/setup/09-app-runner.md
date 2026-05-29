# Phase 9 — AWS App Runner Deployment

**Goal:** Containerize the HQ dashboard and MCP server, push images to ECR, and deploy both as App Runner services with secrets wired in from Secrets Manager.

**Prerequisites:**
- Phase 1 complete — ECR repositories created, `lp-app-runner-role` exists
- Phase 8 complete — HQ dashboard builds and passes health check
- Phase 7 complete — MCP server builds cleanly
- Docker installed locally (`docker --version`)

---

## 1. Write the Dockerfile for each app

**`apps/hq/Dockerfile`:**
```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/hq/package.json ./apps/hq/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @lp-ai/lib-db generate
RUN pnpm --filter @lp-ai/hq build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV USE_AWS_SECRETS=true
COPY --from=builder /app/apps/hq/.next/standalone ./
COPY --from=builder /app/apps/hq/.next/static ./apps/hq/.next/static
COPY --from=builder /app/apps/hq/public ./apps/hq/public

EXPOSE 3000
CMD ["node", "apps/hq/server.js"]
```

**`apps/mcp-server/Dockerfile`:**
```dockerfile
FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/db/package.json ./packages/db/
COPY packages/config/package.json ./packages/config/
COPY packages/embedding/package.json ./packages/embedding/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm --filter @lp-ai/lib-db generate
RUN pnpm --filter @lp-ai/mcp-server build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV USE_AWS_SECRETS=true
COPY --from=builder /app/apps/mcp-server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3001
CMD ["node", "dist/index.js"]
```

---

## 2. Build and push images to ECR

```bash
# Authenticate Docker with ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# HQ dashboard
docker build -f apps/hq/Dockerfile -t lp-internal/hq .
docker tag lp-internal/hq \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/lp-internal/hq:latest
docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/lp-internal/hq:latest

# MCP server
docker build -f apps/mcp-server/Dockerfile -t lp-internal/mcp-server .
docker tag lp-internal/mcp-server \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/lp-internal/mcp-server:latest
docker push \
  ${AWS_ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/lp-internal/mcp-server:latest
```

---

## 3. Create App Runner services

**HQ dashboard:**
```bash
aws apprunner create-service \
  --service-name lp-internal-hq \
  --source-configuration '{
    "ImageRepository": {
      "ImageIdentifier": "'${AWS_ACCOUNT_ID}'.dkr.ecr.us-east-1.amazonaws.com/lp-internal/hq:latest",
      "ImageConfiguration": {
        "Port": "3000",
        "RuntimeEnvironmentVariables": {
          "NODE_ENV": "production",
          "USE_AWS_SECRETS": "true",
          "AWS_REGION": "us-east-1"
        }
      },
      "ImageRepositoryType": "ECR"
    },
    "AutoDeploymentsEnabled": true,
    "AuthenticationConfiguration": {
      "AccessRoleArn": "arn:aws:iam::'${AWS_ACCOUNT_ID}':role/lp-app-runner-role"
    }
  }' \
  --instance-configuration '{
    "Cpu": "0.25 vCPU",
    "Memory": "0.5 GB",
    "InstanceRoleArn": "arn:aws:iam::'${AWS_ACCOUNT_ID}':role/lp-app-runner-role"
  }' \
  --health-check-configuration '{
    "Protocol": "HTTP",
    "Path": "/api/health",
    "Interval": 10,
    "Timeout": 5,
    "HealthyThreshold": 1,
    "UnhealthyThreshold": 5
  }'
```

Wait for it to be running:
```bash
aws apprunner describe-service --service-arn <arn-from-above> \
  --query "Service.Status"
```

Get the service URL:
```bash
aws apprunner describe-service --service-arn <arn> \
  --query "Service.ServiceUrl" --output text
```

---

## 4. Open RDS to App Runner's VPC

App Runner services run in a managed VPC. You need a VPC connector to give them access to RDS.

```bash
# Get your private subnet IDs
SUBNET_IDS=$(aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query "Subnets[*].SubnetId" \
  --output text)

# Create VPC connector
aws apprunner create-vpc-connector \
  --vpc-connector-name lp-internal-vpc-connector \
  --subnets $SUBNET_IDS \
  --security-groups $SG_ID
```

Associate the VPC connector with each service in the App Runner console:
**Services → lp-internal-hq → Configuration → Networking → VPC connector → select `lp-internal-vpc-connector`**

Then remove the public `0.0.0.0/0` rule from the RDS security group (added temporarily in Phase 2):
```bash
aws ec2 revoke-security-group-ingress \
  --group-id $SG_ID --protocol tcp --port 5432 --cidr 0.0.0.0/0
```

---

## 5. Add custom domain (optional)

In the App Runner console:
**lp-internal-hq → Custom domains → Add domain**

Enter `hq.launchpadphilly.org`. AWS will give you CNAME records to add in your DNS provider.

---

## Verification checklist

- [ ] Both images pushed to ECR
- [ ] `lp-internal-hq` App Runner service status: `RUNNING`
- [ ] `https://<apprunner-url>/api/health` returns `{ status: 'ok' }`
- [ ] Google sign-in works on the deployed URL
- [ ] RDS public access disabled; App Runner connects via VPC connector

---

## Known pitfalls

- **Build fails in Docker** — pnpm workspace builds require all `package.json` files to be copied before `pnpm install`. The Dockerfile above handles this; if you add a new package, update the COPY steps.
- **Secrets Manager access denied** — the `lp-app-runner-role` must have `SecretsManagerReadWrite` and be listed as the instance role.
- **Cold starts** — App Runner scales to zero by default. Set minimum instances to 1 to avoid 5–10s cold starts on first request.

---

**Next:** [10-eventbridge-cron.md](10-eventbridge-cron.md)

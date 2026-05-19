# syntax=docker/dockerfile:1.7
# Build context must be the repo root, not apps/hq:
#   docker build -f apps/hq/Dockerfile -t lp-hq .

# ----- deps -------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /workspace

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY tsconfig.base.json eslint.config.mjs ./
COPY apps/hq/package.json apps/hq/package.json
COPY apps/mcp-server/package.json apps/mcp-server/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/embedding/package.json packages/embedding/package.json
COPY connectors/aplos/package.json connectors/aplos/package.json
COPY connectors/bigquery/package.json connectors/bigquery/package.json
COPY connectors/givebutter/package.json connectors/givebutter/package.json
COPY connectors/google-drive/package.json connectors/google-drive/package.json
COPY connectors/google-sheets/package.json connectors/google-sheets/package.json
COPY connectors/roam/package.json connectors/roam/package.json
COPY connectors/slack/package.json connectors/slack/package.json

RUN pnpm install --frozen-lockfile

# ----- builder ----------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
WORKDIR /workspace

COPY --from=deps /workspace/node_modules ./node_modules
COPY . .
# Re-link workspace symlinks now that source is in place.
RUN pnpm install --frozen-lockfile --offline

RUN pnpm --filter @lp-ai/db generate
RUN pnpm --filter @lp-ai/config build
RUN pnpm --filter @lp-ai/db build
RUN pnpm --filter @lp-ai/embedding build
RUN pnpm --filter @lp-ai/hq build

# ----- runner -----------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates wget \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd -r nodejs && useradd -r -g nodejs next

# Next.js standalone bundle (server.js + minimal node_modules)
COPY --from=builder --chown=next:nodejs /workspace/apps/hq/.next/standalone ./
COPY --from=builder --chown=next:nodejs /workspace/apps/hq/.next/static ./apps/hq/.next/static
COPY --from=builder --chown=next:nodejs /workspace/apps/hq/public ./apps/hq/public

# Prisma generated client + engine binaries (Next.js standalone trace misses
# the .so.node engine file — copy it into the same .pnpm path the runtime
# expects).
COPY --from=builder --chown=next:nodejs \
  /workspace/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client \
  ./node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client

USER next
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/hq/server.js"]

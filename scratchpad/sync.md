# apps/sync/

Not a source directory — just a `Dockerfile`. Builds a single multi-purpose Docker image that can run any connector as a one-off ECS Fargate task.

## Dockerfile

- Multi-stage build: `deps` → `builder` → `runner`
- Base: `node:22-bookworm-slim`, pnpm v10
- Builds the entire workspace: all `packages/*` and all `connectors/*`
- Default command is a no-op — the actual command is overridden per-task by EventBridge (e.g. `cd /workspace/connectors/google-sheets && node dist/cli.js`)
- Runs as non-root user `lpsync`
- Uses `pnpm install --offline` for reproducible builds

## Why one image?

Avoids maintaining separate Docker images per connector. EventBridge schedules trigger ECS tasks that override the command, so one image serves all sync jobs (google-sheets, aplos, notion, etc.) with different entry points.

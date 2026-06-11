# Security Review

**Date:** 2026-06-11
**Scope:** Full repository audit — auth, secrets, injection, data exposure, infrastructure

---

## Critical

### ~~1. AWS Jobs routes bypass authentication~~ FIXED 2026-06-11

**File:** `apps/hq/middleware.ts:5`

`/aws-jobs` and `/api/aws-jobs` were in `PUBLIC_PATHS`, meaning anyone could view, approve, or reject AWS resource deployment jobs without signing in.

**Fix:** Removed both from `PUBLIC_PATHS`. These routes now require authentication.

---

### 2. Approver email accepted from client in AWS Jobs API

**File:** `apps/hq/app/api/aws-jobs/[id]/route.ts:31,50`

The POST endpoint accepts an arbitrary `approver` field from the request body:
```typescript
const { action, approver } = body as { action?: string; approver?: string };
approver: approver ?? 'admin@launchpadphilly.org',
```

Any caller can impersonate any email as the approver.

**Fix:** Extract the approver from the NextAuth session. Reject client-provided values.

---

### 3. Terraform code execution without sandboxing

**File:** `apps/aws-mcp-server/src/tools/aws-resources.ts:81,121-131`

User-supplied Terraform code is written directly to disk and executed via `execAsync`. A malicious Terraform provider or backend configuration could execute arbitrary commands.

**Fix:** Run Terraform in a container/sandbox with restricted network and filesystem access. Validate Terraform code structure before execution.

---

### ~~4. SQL injection via column name fallback in query_students~~ FIXED 2026-06-11

**File:** `apps/mcp-server/src/tools/query-students.ts:70`

The `?? field` fallback meant if `field` wasn't in the whitelist, raw user input was interpolated into SQL.

**Fix:** Removed the `?? field` fallback. Now returns an error if `field` is not in `FIELD_TO_COLUMN`.

---

## High

### ~~5. HQ_DEV_NO_AUTH bypass has no NODE_ENV guard~~ FIXED 2026-06-11

**File:** `apps/hq/middleware.ts:14`

The dev auth bypass could fire in production if the env var was set.

**Fix:** Added `process.env.NODE_ENV === 'development'` guard to the condition.

---

### 6. Error messages leak internal details

**Files:**
- `apps/hq/app/api/aws-jobs/[id]/route.ts:23,70` — raw `err.message` returned
- `apps/mcp-server/src/serve-http.ts:140,254` — database errors forwarded to client
- `apps/mcp-server/src/tool-helpers.ts:48-52` — full error message in tool response

**Fix:** Return generic error messages to clients. Log full errors server-side only.

---

### 7. No rate limiting on OAuth or MCP endpoints

**Files:**
- `apps/mcp-server/src/serve-http.ts:161` — `/oauth/register` accepts unlimited DCR requests
- `apps/mcp-server/src/serve-http.ts:179` — `/oauth/authorize` has no throttle
- `apps/mcp-server/src/serve-http.ts:211` — `/mcp` endpoint has no per-user rate limit

**Fix:** Add rate limiting middleware. Suggested limits:
- `/oauth/register`: 10 req/min per IP
- `/oauth/authorize`, `/oauth/token`: 100 req/min per IP
- `/mcp`: 1,000 tool calls/hour per user

---

### 8. OAuth redirect URI allows any HTTPS domain

**File:** `apps/mcp-server/src/oauth/dcr.ts:36-46`

DCR enforces HTTPS but allows any domain as a redirect URI. An attacker could register a phishing domain.

**Fix:** Maintain a whitelist of allowed redirect URI domains, or require admin approval for new client registrations.

---

### 9. OAuth authorization code reuse race condition

**File:** `apps/mcp-server/src/oauth/flow.ts:224`

The check for `usedAt` and the update that sets it are not atomic:
```typescript
if (row.usedAt) return fail('code already used');
// gap — another request could use the same code here
await prisma.oAuthAuthorizationCode.update({ where: { code }, data: { usedAt: new Date() } });
```

**Fix:** Use a single atomic update with a conditional (`WHERE usedAt IS NULL`) and check the affected row count.

---

## Medium

### 10. SQL injection surface in HQ freshness query

**File:** `apps/hq/app/page.tsx:68`

```typescript
`SELECT COUNT(*)::bigint AS count, MAX("${column}") AS last_at FROM "${table}"`
```

Currently safe because table/column values are hardcoded, but the pattern invites future injection if parameters become dynamic.

**Fix:** Add an explicit whitelist check before interpolation.

---

### 11. Service callers bypass all tool ACLs

**File:** `apps/mcp-server/src/tool-helpers.ts:26`

Callers with `SYNC_SECRET` skip permission checks entirely. If the secret leaks, the attacker gets unrestricted access to all 16 MCP tools.

**Fix:** Consider per-service tokens with scoped permissions. Rotate `SYNC_SECRET` regularly. Log all service-account tool calls.

---

### 12. Direct process.env access bypasses validation

**Files:**
- `apps/hq/middleware.ts:14`
- `connectors/aplos/src/aplos-client.ts:10,20`
- `apps/mcp-server/src/serve-http.ts:19,21`
- `apps/aws-mcp-server/src/tools/aws-resources.ts:17,167,168`

Project convention requires `loadEnv()` from `@lp-ai/lib-config`. Direct `process.env` access bypasses Zod validation.

**Fix:** Route all env access through the typed `env` object.

---

### 13. SYNC_SECRET has no minimum length validation

**File:** `packages/config/src/schema.ts:69`

```typescript
SYNC_SECRET: optional,
```

An empty or trivially short value would be accepted.

**Fix:** `SYNC_SECRET: z.string().min(32).optional()`

---

## Low

### 14. No Content Security Policy headers

The HQ dashboard does not set CSP headers. Internal tool, but CSP would prevent any future XSS.

**Fix:** Add CSP headers via `next.config.js` security headers.

---

### 15. No audit logging for failed login attempts

**File:** `apps/hq/auth.config.ts`

Failed sign-in attempts (wrong domain) are silently dropped.

**Fix:** Log failed attempts with email and timestamp for intrusion detection.

---

### 16. Docker images lack additional hardening

All Dockerfiles correctly use non-root users. Missing: `--security-opt=no-new-privileges`, read-only root filesystem, dropped capabilities.

---

### 17. NextAuth is a beta version

`next-auth@5.0.0-beta.31` — acceptable for an internal tool but worth tracking for stable release.

---

## Positive Findings

- All Dockerfiles run as non-root users
- Prisma ORM used consistently (prevents most SQL injection)
- Secrets stored in AWS Secrets Manager, not in code
- MCP OAuth implements PKCE with constant-time comparison
- Domain restriction on Google sign-in (`@launchpadphilly.org`, `@b21.org`)
- Tool permission ACLs checked on every call with DB-backed cache
- No hardcoded secrets anywhere in the codebase
- Usage logging on all MCP tool calls
- All external data validated with Zod schemas

---

## Priority Order

| # | Issue | Severity | Status |
|---|---|---|---|
| 1 | ~~AWS Jobs routes unauthenticated (#1)~~ | Critical | **FIXED** 2026-06-11 |
| 2 | Approver email spoofing (#2) | Critical | Open |
| 3 | ~~SQL injection fallback (#4)~~ | Critical | **FIXED** 2026-06-11 |
| 4 | ~~NODE_ENV guard on dev bypass (#5)~~ | High | **FIXED** 2026-06-11 |
| 5 | Error message sanitization (#6) | High | Open |
| 6 | Rate limiting (#7) | High | Open |
| 7 | OAuth redirect URI whitelist (#8) | High | Open |
| 8 | Auth code race condition (#9) | High | Open |
| 9 | Terraform sandboxing (#3) | Critical | Open |
| 10 | Remaining medium/low items | Medium–Low | Open |

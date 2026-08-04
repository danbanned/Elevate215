# QuickBooks OAuth — Local Dev Setup

This documents the exact process for getting the QuickBooks OAuth flow working locally,
based on the real setup walkthrough. Follow these steps in order.

---

## Prerequisites

- Intuit Developer account at [developer.intuit.com](https://developer.intuit.com/app/developer/homepage)
- An app created in that account ("Elevate215 – Launchpad Integration") with:
  - `com.intuit.quickbooks.accounting` scope selected
  - Development Redirect URI registered (see Step 3)
- The repo cloned locally with `pnpm install` run at the root

---

## Step 1 — Get your Development keys from Intuit

1. Go to [developer.intuit.com/app/developer/homepage](https://developer.intuit.com/app/developer/homepage)
2. Open your app → **Keys & credentials**
3. Toggle to **Development** (not Production)
4. Copy your **Development Client ID** and **Development Client Secret**

> ⚠️ Do not use Production keys for local testing. Production keys require a real
> HTTPS domain as the Redirect URI — localhost will be rejected.

---

## Step 2 — Build the connector package

Next.js does not hot-reload changes inside workspace packages. Always rebuild before
starting the dev server:

```bash
cd connectors/quickbooks
pnpm build
cd ../..
```

---

## Step 3 — Register the Development Redirect URI in Intuit

1. In your Intuit app → **Keys & credentials → Development → Redirect URIs**
2. Add exactly:
   ```
   http://localhost:3000/api/quickbooks/callback
   ```
3. This must match **character-for-character** what's in your `.env` file.
   Even a port mismatch (`3000` vs `3001`) will cause a redirect_uri error.

> Note: check what port your dev server actually starts on before registering.
> Run `pnpm --filter @lp-ai/hq dev` and look for `Local: http://localhost:XXXX`
> in the terminal output. Use that exact port.

---

## Step 4 — Create `apps/hq/.env`

Next.js reads `.env` from its own directory (`apps/hq/`), not the repo root.
Create `apps/hq/.env` with the following:

```dotenv
# Database
DATABASE_URL=postgresql://...your_neon_connection_string...

# QuickBooks — leave Production keys blank for local dev, use Dev keys instead
QUICKBOOKS_CLIENT_ID=
QUICKBOOKS_CLIENT_SECRET=
QUICKBOOKS_DEV_CLIENT_ID=your_development_client_id
QUICKBOOKS_DEV_CLIENT_SECRET=your_development_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:3000/api/quickbooks/callback

# Auth — required by NextAuth, any random 32+ char string works locally
AUTH_SECRET=run_node_-e_"console.log(require('crypto').randomBytes(32).toString('hex'))"_to_generate

# Auth bypass — skips Google OAuth gate for local dev only
# Only works when NODE_ENV=development (i.e. running next dev, not a production build)
HQ_DEV_NO_AUTH=true
```

**Generate a real AUTH_SECRET** by running:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output and paste it as the `AUTH_SECRET` value.

> ⚠️ Never commit `.env` to git. Confirm it is listed in `.gitignore` before saving.

---

## Step 5 — Start the dev server

```bash
pnpm --filter @lp-ai/hq dev
```

Watch for:
- `✓ Ready in X.Xs` — server started successfully
- `Local: http://localhost:3000` — confirms the actual port

If you see `Error: QUICKBOOKS_CLIENT_ID (or QUICKBOOKS_DEV_CLIENT_ID) not set`,
the `.env` values aren't being read — confirm the file is in `apps/hq/.env`
(not the repo root) and that the variable names are spelled exactly as above.

---

## Step 6 — Test the connect flow

Open your browser and navigate to:
```
http://localhost:3000/api/quickbooks/connect
```

**What should happen:**
1. The route generates a random `state` value and sets a signed cookie
2. It builds the authorization URL with your Client ID, scope, and redirect URI
3. Your browser is redirected to Intuit's real consent screen
4. You log in and authorize a **sandbox company** (not real data)
5. Intuit redirects back to `http://localhost:3000/api/quickbooks/callback`
6. The callback exchanges the authorization code for tokens and saves them to
   the `connector_credentials` table in Postgres

---

## Step 7 — Verify tokens were saved

After a successful authorization, confirm the tokens actually landed in the database:

```sql
SELECT connector, external_account_id, expires_at, created_at
FROM connector_credentials
WHERE connector = 'quickbooks';
```

You should see one row with:
- `connector` = `quickbooks`
- `external_account_id` = the sandbox company's realmId
- `expires_at` = approximately 1 hour from now
- Real (long) values in `access_token` and `refresh_token`

If this row exists — the full OAuth flow worked end-to-end.

---

## Step 8 — Test the token refresh (optional but recommended)

To verify the refresh logic works before going to production:

1. Manually update the row's `expires_at` to a past timestamp:
   ```sql
   UPDATE connector_credentials
   SET expires_at = NOW() - INTERVAL '1 hour'
   WHERE connector = 'quickbooks';
   ```
2. Trigger a call to `getQuickBooksAccessToken(realmId)` (via a test script or
   another connect flow)
3. Confirm the row updates with new token values and a future `expires_at`

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `QUICKBOOKS_CLIENT_ID not set` | `.env` not in `apps/hq/` or wrong variable name | Confirm file location and spelling |
| `redirect_uri query parameter is invalid` | URI in `.env` doesn't match what's registered in Intuit | Check port and path match exactly |
| `scope query parameter is missing` | Stale compiled bundle | Rebuild connector (`pnpm build` in `connectors/quickbooks`) and restart HQ |
| `307` redirect to blank page | `AUTH_SECRET` missing or `HQ_DEV_NO_AUTH` not set | Add both to `apps/hq/.env` and restart |
| `MissingSecret` error in logs | `AUTH_SECRET` not set | Generate one with `node -e "..."` and add to `.env` |
| App shows on port 3001 instead of 3000 | Port conflict | Update `QUICKBOOKS_REDIRECT_URI` and Intuit's registered URI to match actual port |

---

## Production vs Development keys — when to use which

| Environment | Keys to use | Redirect URI |
|---|---|---|
| Local dev / testing | `QUICKBOOKS_DEV_CLIENT_ID/SECRET` | `http://localhost:3000/api/quickbooks/callback` |
| Production (real Stacy call) | `QUICKBOOKS_CLIENT_ID/SECRET` | `https://<deployed-domain>/api/quickbooks/callback` |

The connector automatically falls back to Dev keys when Production keys are blank —
so for local testing, leave `QUICKBOOKS_CLIENT_ID` and `QUICKBOOKS_CLIENT_SECRET`
empty and only fill in the `DEV_` variants.

---

## Related files

- `connectors/quickbooks/src/quickbooks-client.ts` — OAuth URL builder, token exchange, refresh logic
- `apps/hq/app/api/quickbooks/connect/route.ts` — initiates the OAuth flow
- `apps/hq/app/api/quickbooks/callback/route.ts` — receives the authorization code, saves tokens
- `apps/hq/app/quickbooks/connected/page.tsx` — confirmation page after successful auth
- `apps/hq/app/quickbooks/error/page.tsx` — error page if something goes wrong
- `packages/db/prisma/schema.prisma` — `ConnectorCredential` model definition

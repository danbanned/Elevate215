
Couldnt have anything to do with the launchpads internal databse, different system, similar architecture  julien isnt touching anyhting but the rollup, and quickbooks data, and for the problem about touches Aplos/Not

pasted

we are gonna make those changes, also you mentioned that we need,  No token-refresh logic — meaning if the access token expires, there's currently no code that automatically uses the refresh token to get a new one. Still just a placeholder.

we are gonna turn this into phases we can hand-off to claude

Two things worth catching here before you fill anything in:

1. You're on the Production toggle, not Development. The blue highlighted side is Production — but you said you want to set up development right now. For dev work, click the Development side of that toggle first. The App URLs here are also environment-specific, so anything you enter matters per-environment.

2. These "App URLs" fields aren't the ones you actually need for the OAuth flow — this is the same distinction we hit earlier. Host domain / Launch URL / Disconnect URL / Connect-Reconnect URL are for apps that get listed in the QuickBooks App Store and launched from inside QuickBooks. For a private integration like Elevate215's, these mostly don't apply. The field that actually matters for authentication is the Redirect URI, which lives under the separate "Redirect URIs" tab (you can see it in the top nav of your screenshot, a few tabs to the right of "App URLs").

So — yes, you set some of this up before, but for getting development working right now, the App URLs tab isn't where the action is. What you actually need for dev is just:

Development Client ID + Client Secret → from the Keys & credentials page (Development side)
Development Redirect URI → from the Redirect URIs tab (not App URLs), set to your local callback like http://localhost:3000/callback
The App URLs fields on this screen can stay blank for a private dev integration unless Intuit specifically blocks you from proceeding without them.

Since the repo's being restructured in Phase 3 and you may be rebuilding under the shared developer@launchpadphilly.org account — worth confirming this app you're looking at is the one your rebuilt connector will actually point at, so you're not configuring an app you're about to abandon. Is this the app under the shared account, or the earlier personal-account test app?

ok then what do i need to do to get the url for me to hand to stacy so i can get the authorization code

Hold on — there's a sequencing issue worth catching before you build that URL, because right now it would point at nothing.

The authorization URL you hand to Stacy sends her (after she approves) to your Redirect URI. For that to actually work, the Redirect URI has to be a live endpoint that can receive the response. Two problems with doing this right now:

You're set up for development, and dev uses localhost. A localhost:3000/callback URL only exists on your machine — Stacy's browser can't reach it. So a dev-configured URL fundamentally can't be used with Stacy on a real call; that requires the production setup (real deployed https://hq.launchpadinc.org/api/quickbooks/callback), which you said you're doing later.
The connector's being rebuilt in Phase 3. The callback endpoint that receives Stacy's authorization response is exactly what you're about to delete and remake. Until that's rebuilt and deployed, there's nothing on the other end to catch the code.
So there's a fork here depending on what you're actually trying to do:

If you're testing the flow yourself (dev/sandbox): you don't hand a URL to Stacy at all — you use your own sandbox company. You build the dev auth URL with your Development Client ID + localhost redirect, open it yourself, authorize against a sandbox company, and catch the code locally (or via the OAuth Playground, like you did before). No Stacy involved.

If this is genuinely for Stacy's real QuickBooks (the actual call): that can't run on the dev setup — it needs the production app fully configured (production keys, real deployed HTTPS redirect URI, rebuilt-and-deployed callback), which is the "later" work.

Which one is this? If you're just trying to test the connector end-to-end yourself before the real call, I can walk you through building the sandbox auth URL for your own use. If you're prepping the actual Stacy handoff, the honest answer is that's blocked until production + the rebuilt callback are live — and worth not scheduling against until they are.

i want to set up the real thing 
If this is genuinely for Stacy's real QuickBooks (the actual call): that can't run on the dev setup — it needs the production app fully configured (production keys, real deployed HTTPS redirect URI, rebuilt-and-deployed callback), which is the "later" work.


Sequenced production prerequisites and clarified deployment dependencies
Sequenced production prerequisites and clarified deployment dependencies
Good, that's a real decision — let's lay out exactly what has to happen, in order, since several pieces depend on each other and skipping ahead would just produce a broken link.

The actual sequence, in dependency order
1. Finish Phase 3 (repo restructure) first — this is the current blocker
You're mid-deletion/rebuild right now. The QuickBooks callback endpoint doesn't exist in a working state until this phase completes and Phase 1 (rebuilding the connector + token storage) is done. Nothing below can be tested until there's actual code deployed to receive Stacy's authorization.

2. Get Production Client ID + Client Secret
Under the Production toggle (not Development) → Keys & credentials. This unlocks only after:

Production Key Requirements form is complete (app description, security/privacy statement)
Compliance / App assessment questionnaire (~30-40 min) — last we checked, this was still untouched
Legal docs — Privacy Policy URL and EULA URL under "App terms of service" — still an open item since these need to come from Christian/Rob, not something you can fabricate
3. Deploy the rebuilt callback endpoint to a real, live URL
Once Phase 3/1 rebuild the connector, it needs to actually be deployed — not just written — to something like https://hq.launchpadinc.org/api/quickbooks/callback. A URL that isn't deployed can't receive anything, regardless of what's registered in Intuit.

4. Register that exact URL under Production → Redirect URIs
Must match character-for-character what your deployed endpoint actually is.

5. Confirm the database side is real and connected
The ConnectorCredential table needs to exist in whatever database the deployed app reads from (confirmed earlier — separate from your local Neon test), and the token-refresh logic needs to be in place so the connection doesn't quietly die after the first hour.

6. Only then — build the actual authorization URL

https://appcenter.intuit.com/connect/oauth2?client_id=PRODUCTION_CLIENT_ID&scope=com.intuit.quickbooks.accounting&redirect_uri=https://hq.launchpadinc.org/api/quickbooks/callback&response_type=code&state=RANDOM_STRING
7. Send that link to Stacy, get on the call

The honest bottleneck right now: steps 1-3 are unfinished, and step 2 has real dependencies outside your control (legal docs, compliance questionnaire time). None of this is a "just hand her a link" task today — it's a multi-step deploy pipeline that needs to complete first.

Given where things stand, worth deciding: do you want to tackle the compliance questionnaire + legal docs ask in parallel with finishing Phase 3/1 (since they don't depend on each other), so you're not doing everything sequentially? I can draft the legal-docs ask to Christian/Rob right now while Claude Code works through the repo restructure — want me to do that?


Quick correction before anything else: this isn't Phase 3 finished — this is Phase 3's plan, with execution explicitly not yet started. The report ends with "nothing has been deleted, moved, or migrated" and is waiting on you for two things. Worth being precise about that distinction since the next message you send needs to unblock it, not review a done thing.

Urgent — resolve this first, before anything else

There are 50 uncommitted deletions in your working tree that nobody in this conversation asked for. This is the most important line in the whole report: connectors/google-sheets/ — the one you explicitly want to keep — is already deleted on disk, along with a batch of infra files. This didn't come from the plan (it doesn't match either direction of it) and wasn't run by Claude Code as part of this task. That means either:

Something else touched this repo (another tool, another session, a teammate, an editor autosave/revert gone wrong), or
An earlier interrupted process left this behind

Before approving anything below, run git status yourself and look at this. Claude Code flagged it's fully recoverable (git checkout -- <path>, nothing staged/committed) — but you want to understand why it happened before just reverting blind, in case it points to something worth knowing (like a bad script that's still running, or someone else with write access to this checkout).

The four things it's waiting on your call for

1. apps/aws-mcp-server — not load-bearing for anything, purely a feature question. Does Elevate215 need AWS-resource-provisioning via chat (creating databases/servers through an approval queue)? If not in scope yet, drop it — easy to re-add later since nothing depends on it.
My read: drop it. Nothing in your current scope (QuickBooks + School Rollup) needs infrastructure-provisioning-via-MCP.

2. apps/sync — this is the actual mechanism for scheduled syncs (EventBridge → Fargate, running QuickBooks/School Rollup pulls automatically instead of someone manually running a command). If you want data refreshing on a schedule without a human triggering it, keep it, pruned to only build QuickBooks + School Rollup.
My read: keep it — you'll want scheduled syncs eventually, and pruning is cheap now vs. rebuilding this mechanism later.

3. EntityAlias/PendingAlias/entity-resolution.ts — tied to Student/Staff via hard foreign keys, and the matching code is hardcoded to student/staff, not reusable as-is. Recommendation is delete alongside Student/Staff.
My read: agree with deleting — Elevate215 doesn't have a "same person shows up under different names across systems" problem yet (unlike Launchpad's messy multi-source student data), so there's nothing to resolve.

4. README.md — needs a full rewrite regardless, since it's already stale (references a deleted connector). Fold into this restructure, or handle separately?
My read: separate task, lower priority — don't let it block the actual deletion/rebuild work.

Suggested reply to send back to Claude Code: confirm the working-tree mystery first (or explicitly say "I checked, here's what happened, proceed"), then answer 1–4, e.g.: "Drop aws-mcp-server. Keep apps/sync, pruned to QuickBooks + School Rollup only. Delete EntityAlias/PendingAlias/entity-resolution.ts along with Student/Staff. README rewrite is a separate task — don't block on it. Now execute the KEEP/DELETE plan, migrations still require my separate approval as instructed."

Want me to write that as the literal next prompt?

i deleetd it by accident, tell claude add it back and procceees

Noop
Noop

Here's the message to send:

The 50 uncommitted deletions were me — I accidentally deleted those files myself before this 
task started, not something to investigate further. Please restore them (git checkout -- <path> 
or equivalent) so we're back to a clean, matching-the-plan starting point, then proceed.

Answers to the four ambiguous items:

1. apps/aws-mcp-server — DELETE. Not in scope; nothing depends on it, easy to re-add later if 
   we ever need AWS-resource-provisioning via chat.

2. apps/sync — KEEP, but pruned. Remove any COPY lines / references to notion, slack, bigquery, 
   google-drive. We want scheduled production syncs (EventBridge → Fargate) for QuickBooks and 
   School Rollup eventually, so keep this mechanism rather than rebuilding it later.

3. EntityAlias, PendingAlias, entity-resolution.ts — DELETE, alongside Student/Staff. We don't 
   have a multi-source identity-matching problem in Elevate215 the way Launchpad does, and the 
   matching logic is hardcoded to student/staff anyway, not reusable as-is.

4. README.md — separate task, not part of this restructure. Leave it stale for now; don't block 
   on rewriting it.

With the working tree restored and these four decisions made, proceed with the full KEEP/DELETE 
plan exactly as you laid it out. Reminder of the standing rules:
- Any Prisma model deletion requires a migration — do NOT run it. Stop and show me the migration 
  it would produce, and wait for my separate explicit approval before applying it.
- Everything else (file/connector/tool deletions that don't require a schema migration) can 
  proceed directly.
- After execution, give me a summary of what was actually deleted/kept/moved, and a clear list 
  of what's still pending my migration approval.

Two things worth knowing before you send this:

The migration gate still applies — even with all four questions answered, deleting Student/Staff/EntityAlias/etc. still needs a schema migration, and per your own earlier instruction, Claude Code should stop and show you that migration rather than just running it. Worth watching for that pause in its next response rather than assuming "proceed" means "including the database."

packages/db/src/seed.ts was flagged as a compile-time dependent that references the models being deleted — the prompt above doesn't explicitly tell Claude Code to fix that, but it already knows from its own findings, so it should handle it as part of "proceed with the plan." If it doesn't mention seed.ts in its next report, that's worth flagging back.


Solid execution — the parts worth actually paying attention to are the ones it flagged as beyond your literal instructions, and one thing worth double-checking before you greenlight the migration.

The judgment calls it made on its own — worth a quick sanity check, not blind approval
Deleting AwsResourceJob + the /aws-jobs UI — correct call, genuinely unavoidable once aws-mcp-server is gone (nothing else produces or reads that data). Good that it flagged this as an addition rather than silently expanding scope.
Gutting google-sheets down to just plumbing (sheets-client.ts, errors.ts, cli.ts) — this is the one worth actually looking at. It found that every single sync file (parse.ts + 13 sync-*.ts files) was Launchpad-column-specific, not generic — meaning the "template" you're keeping for School Rollup is now genuinely just a bare client wrapper, not a working example of a sync. That's honest and probably correct, but it means Phase 4 (School Rollup) is more of a from-scratch build than a "adapt the existing pattern" job. Worth knowing going in so you're not surprised later.
Finding and fixing the finance-audit.ts bug mid-execution (it referenced 5 deleted tools and 9 deleted query types, would've silently broken) — this is exactly the kind of dependency-tracing you wanted from this phase. Good catch, correctly flagged as unplanned.
Before you say "run the migration" — one thing to verify first

The migration drops 17 tables, including entity_aliases, students, staff, and everything donor-related. This is irreversible against your live Neon DB once applied. Two quick checks before you give the go-ahead:

Confirm this is still the same empty/dev Neon database from earlier (the one you confirmed had zero rows in students, etc.) — not something that's since accumulated real data from a sync job someone ran in the meantime.
Ask Claude Code to show you the actual migration SQL file content, not just trust the summary — it's a hand-authored migration (not auto-generated), so worth eyeballing the drop order and the tool_permissions cleanup once yourself before it runs.

If both check out, the reply to send is simple:

Confirmed the Neon DB is still empty/dev, no real data has landed since we checked. 
Show me the full migration SQL file content for one final review, then run it via 
prisma migrate deploy, same as the ConnectorCredential migration. Verify directly 
against the database afterward (query information_schema, not just exit code) and 
confirm the 17 tables are actually gone and tool_permissions no longer has the 16 
stale rows.

Once that's done, Phase 3 is genuinely complete, and you're clear to move to Phase 1 (rebuilding the QuickBooks connector + token-refresh logic) on a clean repo.


Good — clean finish, and worth acknowledging that the mid-run failure was handled correctly rather than just papered over: it verified the partial-apply state directly (not assumed), traced the root cause to a pre-existing bug rather than something this session introduced, and fixed the migration to be idempotent before re-running rather than hacking around a symptom. That's the right instinct for something touching a live database.

One thing worth flagging for your own notes, not urgent: student_postsecondary and aws_resource_jobs apparently never existed in this database at all, even from the very first migration run — meaning the original schema/migration history has a bug independent of anything you've done this week. Not a problem today since those tables are gone either way, but if this repo ever gets used as a template for another client's Elevate215-style instance, that pre-existing migration bug will resurface. Worth a one-line note in your weekly summary or a ticket for whoever eventually cleans up migration history, so it doesn't get rediscovered from scratch later.

Phase 3 is genuinely done now. Confirmed via direct query: 17 Launchpad tables gone, exactly the 15 you wanted remain, stale tool_permissions rows cleared. Repo is clean, restructured, and ready for Phase 1.

Next up: Phase 1 — rebuild the QuickBooks connector fresh in connectors/, plus the token-refresh logic. Since the old apps/hq/app/api/quickbooks/* files are gone and ConnectorCredential already exists and survived the restructure, this is a genuine from-scratch build in the new location, not a patch job. Want me to write that hand-off prompt now, specifying:

Location: connectors/quickbooks/ (matching Aplos's shape) instead of back inside apps/hq
The OAuth callback + token exchange logic (rebuilt from what was deleted, but cleaner)
The token-refresh helper (getQuickBooksAccessToken(realmId)) that was never implemented the first time
Wiring QUICKBOOKS_CLIENT_ID/SECRET through loadEnv() from the start, avoiding the process.env inconsistency from before

Or do you want to handle the .env recreation/verification first, given it's gone missing twice now?


I already added the env back lets go througnh phase 1


Architected Phase 1 QuickBooks connector handoff strategy
Architected Phase 1 QuickBooks connector handoff strategy
Good — here's the Phase 1 hand-off prompt, structured the same way as Phase 3 (plan/confirm before writing, since this touches auth + config + a new connector from scratch).

Phase 1 of the Elevate215 rebuild: build the QuickBooks connector fresh in connectors/, 
following the same shape as connectors/aplos/ (the closest existing pattern — static-credential 
plus a cache-with-expiry helper). This replaces what used to live in apps/hq/app/api/quickbooks/*, 
which was deleted in Phase 3.

Before writing any code, look at connectors/aplos/src/aplos-client.ts and confirm its exact shape 
(how it uses loadEnv(), how it structures the cache-with-expiry check) so the new connector matches 
established convention rather than inventing a new style.

Build the following:

1. Config (packages/config/src/schema.ts):
   Add QUICKBOOKS_CLIENT_ID, QUICKBOOKS_CLIENT_SECRET, QUICKBOOKS_REDIRECT_URI as Zod-validated 
   entries, following the exact pattern already used for APLOS_CLIENT_ID / APLOS_API_KEY. These must 
   be read via loadEnv() everywhere — no process.env access anywhere in the new code, this was a 
   real bug last time and shouldn't recur.

2. connectors/quickbooks/ — new connector package, mirroring aplos/'s structure:
   - The OAuth callback handler: receives `code` and `realmId` from QuickBooks' redirect, exchanges 
     the code for access_token + refresh_token via Intuit's token endpoint, and upserts them into 
     the existing ConnectorCredential model (connector: "quickbooks", externalAccountId: realmId).
   - An initiator/connect step that builds the authorization URL (client_id, scope=
     com.intuit.quickbooks.accounting, redirect_uri, response_type=code, state) — this was never 
     built last time; the old code only had the callback.
   - getQuickBooksAccessToken(realmId): the token-refresh helper that was the whole point of this 
     phase. Reads the stored credential, checks expiresAt, and if expired, calls QuickBooks' refresh 
     endpoint (grant_type=refresh_token) to get a new access_token + refresh_token pair, then upserts 
     the refreshed values back into ConnectorCredential. Model this after Aplos's cache-with-expiry 
     check in getAccessToken(), but note the real difference: Aplos re-derives from a static key with 
     no DB round-trip, while this needs an actual DB read (check expiresAt) and, on refresh, a DB 
     write (save the rotated tokens) — don't just copy Aplos's in-memory-only caching, since that 
     would lose the refreshed token exactly like the original bug this phase exists to fix.
   - Where should the callback/connect HTTP routes actually live given the repo restructure — inside 
     apps/hq/app/api/quickbooks/ again (Next.js API routes, since that's the deployed web app), or 
     does connectors/quickbooks/ hold the logic as a package that apps/hq imports and wraps in thin 
     route handlers? Propose your recommendation and reasoning before implementing — don't just guess 
     the file layout.

3. Error handling worth building in from the start (not an afterthought):
   - What happens if the refresh token itself has expired (QuickBooks refresh tokens roll on ~100 
     days) — this should produce a clear "reauthorization needed" state, not a silent failure or an 
     unhandled exception.
   - What happens if ConnectorCredential has no row yet for a given realmId (first-ever connection 
     vs. a broken/missing one) — distinguish these cases in the error/log output.

4. Tests: at minimum, a test for getQuickBooksAccessToken's expiry-check branching (expired vs. 
   not expired vs. missing row), following whatever test pattern the aplos connector or the recently 
   trimmed tools.test.ts already uses in this repo.

Stop and show me your proposed file layout and the answer to the routing question in item 2 before 
writing full implementation — I want to confirm the structure before it's built out, not after.

Do not run any migration — ConnectorCredential already exists from the earlier migration and 
needs no schema changes for this phase. Do not touch Production Intuit dashboard settings — this 
phase is code only.
One thing worth deciding before you send this: the prompt leaves the route-location question open (routes inside apps/hq vs. logic in connectors/quickbooks wrapped by thin routes) rather than presuming an answer, since that's a real architecture call this repo hasn't established a pattern for yet (Aplos and Google Sheets are both pure sync connectors, not ones that need an HTTP-facing OAuth callback). Want me to just pick one and bake it into the prompt instead, or is it fine to let Claude Code propose and you decide once you see its reasoning?







Claude is AI and can make mistakes. Please

Confirmed: aplos-client.ts's exact shape

- loadEnv() is called inside the exported function on each call (not at module load) — reads env.APLOS_CLIENT_ID / env.APLOS_API_KEY.
- Cache is a module-level let cachedToken: { value, expiresAt } | null, checked with a 60-second buffer: cachedToken.expiresAt > Date.now() + 60_000.
- A resetTokenCache() export exists purely for tests.
- No DB involved at all — Aplos re-derives from a static key every time the cache misses.

Item 1 (config) is already done — QUICKBOOKS_CLIENT_ID/_CLIENT_SECRET/_REDIRECT_URI survived the Elevate215 restructure untouched in packages/config/src/schema.ts, following the exact optional pattern. Nothing to add there.

The routing question — recommendation

Put the actual logic in connectors/quickbooks/ as an importable client module; apps/hq/app/api/quickbooks/{connect,callback}/route.ts become thin Next.js handlers that import from it.

Reasoning:
- QuickBooks' OAuth handshake requires a live, publicly-reachable HTTP redirect — that can only be served by apps/hq (the deployed web app behind the ALB). connectors/* are CLI-invoked batch packages with no HTTP server, so the routing itself has nowhere else to live.
- But getQuickBooksAccessToken() will be needed by two callers eventually: this OAuth flow today, and the connector's own data-sync code once Phase 2 builds it. Duplicating the cache/refresh logic between apps/hq and connectors/quickbooks is exactly the kind of drift that produced the original bug (a stub in apps/hq that never wrote back to the DB). One implementation, imported from both places, avoids that.
- This does introduce one new edge in the package graph: today only apps/sync depends on connectors/*; apps/hq depends only on packages/*. I'm flagging this explicitly rather than quietly doing it — apps/hq/package.json would gain "@lp-ai/connector-quickbooks": "workspace:*", and CLAUDE.md's package-graph table would need a one-line update to note it. This is justified because QuickBooks is the only connector with a 3-legged OAuth model requiring live web interaction; every other connector is static-credential/batch-only.

Proposed file layout

connectors/quickbooks/
├── package.json              # "@lp-ai/connector-quickbooks", deps: lib-config, lib-db, dotenv, zod (mirrors aplos)
├── tsconfig.json             # identical to aplos's (extends ../../tsconfig.base.json)
└── src/
    ├── quickbooks-client.ts  # buildAuthorizationUrl(state), exchangeCodeForTokens(code),
    │                         # refreshTokens(refreshToken), saveQuickBooksCredentials(...),
    │                         # getQuickBooksAccessToken(realmId)  ← the cache-with-expiry-and-refresh helper
    ├── errors.ts             # QuickBooksNotConnectedError, QuickBooksReauthRequiredError
    │                         #   (typed classes, same style as google-sheets/src/errors.ts)
    ├── index.ts              # sync() — noop stub for now: "data sync not yet implemented (Phase 2)",
    │                         #   still calls runSync('quickbooks', ...) per the connector contract in CLAUDE.md
    ├── cli.ts                # identical shape to aplos/cli.ts
    └── quickbooks-client.test.ts

apps/hq/app/api/quickbooks/
├── connect/route.ts          # NEW — builds the authorization URL, sets a short-lived signed/httpOnly
│                             #   state cookie, redirects to Intuit
└── callback/route.ts         # rebuilt — validates state against that cookie, calls exchangeCodeForTokens
                              #   + saveQuickBooksCredentials from the connector package, redirects to
                              #   /quickbooks/connected or /quickbooks/error

Plus: apps/hq/package.json gains the workspace dep; root package.json gains "sync:quickbooks": "pnpm --filter @lp-ai/connector-quickbooks sync" matching the sync:aplos/sync:sheets convention.

One thing I noticed and am flagging rather than silently building: the original callback redirected to /quickbooks/connected and /quickbooks/error, but neither page ever existed in apps/hq/app/quickbooks/ (confirmed — no such directory). That's a pre-existing gap, not something introduced by the restructure. I'm not planning to build those UI pages in this phase since you didn't ask for them — just flagging so the redirect isn't a surprise 404. Say the word if you want stub pages too.

CSRF state validation: the original code had a // TODO: validate state that was never implemented. Since you're now asking me to build the initiator that generates state in the first place, I think it's worth actually closing that TODO now (short-lived httpOnly cookie set at /connect, compared against the callback's state param) rather than reproducing the same unaddressed gap — flagging this as slightly beyond your literal item list, but it's a real security property of the thing I'm building, not scope creep into unrelated territory.

Error handling (item 3)

- No ConnectorCredential row for the realmId → getQuickBooksAccessToken throws QuickBooksNotConnectedError — distinguishable from...
- Refresh attempt itself rejected by Intuit (refresh token expired/revoked, ~100-day rotation) → refreshTokens() detects Intuit's error=invalid_grant response and throws QuickBooksReauthRequiredError, which getQuickBooksAccessToken lets propagate (not swallowed). Both are typed classes with clear .name/.message, not a generic Error, so callers (and eventually the HQ UI) can branch on instanceof.
- Row exists + expiresAt still valid (60s buffer, matching Aplos) → return the stored accessToken directly, no network call.
- Row exists + expired → call refreshTokens(), saveQuickBooksCredentials() the rotated pair (Intuit rotates the refresh token on every use — must persist both), return the new access token.

Testing (item 4)

Neither aplos nor any other connector has a test file today, so there's no connector-level test precedent — but apps/mcp-server/src/permissions.ts establishes this repo's pattern for unit-testing DB-backed caching logic: test-only override hooks (__setPermissionsForTesting/__clearPermissionsCacheForTesting) instead of a live DB. I'd follow that same shape: mock @lp-ai/lib-db's prisma export via vi.mock, and test getQuickBooksAccessToken's three branches (missing row → QuickBooksNotConnectedError; not-expired → returns cached token, no fetch called; expired → calls mocked refresh + upsert, returns new token) plus the invalid_grant → QuickBooksReauthRequiredError path. connectors/**/src/**/*.test.ts is already in vitest.config.ts's include glob, so no config changes needed.

---
Confirming before I write anything: does this layout, the routing split, the CSRF fix, and the mock-based test strategy all look right to build?


This is genuinely good work — the routing recommendation is well-reasoned (not just picked arbitrarily), and two things it flagged on its own are worth explicitly calling out as good instincts, not just approving on autopilot:

The CSRF fix is the right call, not scope creep. The original code had a // TODO: validate state that was never implemented — a real security gap (without it, an attacker could potentially trick someone into authorizing a connection that gets attributed to the wrong session). Since it's already building the piece that generates the state value, closing that gap now costs almost nothing versus reproducing the same unaddressed hole. Approve this.

The package-graph edge it flagged (apps/hq depending on connectors/quickbooks) is worth actually reading, not skimming past. This is a real, permanent architectural change — every other connector is CLI-batch-only, and QuickBooks becomes the first one the live web app imports directly. That's correct given OAuth's requirements, but it's exactly the kind of thing that should be a deliberate decision, which is why it flagged it instead of just doing it quietly. Good discipline.

One thing worth deciding before you approve: it explicitly did not build the /quickbooks/connected and /quickbooks/error pages, noting they never existed even before the restructure — meaning right now, a successful authorization would redirect Stacy to a 404. That's fine to defer if you're not doing the real call imminently, but if the actual Stacy call is still the near-term goal, this needs to not be an afterthought — a 404 after she clicks Allow is a bad experience even if the tokens saved correctly behind the scenes.

Here's the reply to send:

This all looks right — approved as proposed:
- File layout, connectors/quickbooks + thin apps/hq route handlers
- The apps/hq → connectors/quickbooks package-graph edge, noted in CLAUDE.md
- The CSRF state-cookie fix — good catch, build it now rather than reproducing the gap
- Error handling (QuickBooksNotConnectedError / QuickBooksReauthRequiredError distinction)
- Mock-based test strategy following permissions.ts's pattern

One addition: please also build minimal stub pages for /quickbooks/connected and 
/quickbooks/error (apps/hq/app/quickbooks/connected/page.tsx, .../error/page.tsx) — 
just a simple confirmation/error message, not a real UI. We have a real authorization 
call with a client planned, and a 404 after someone clicks Allow is bad even if the 
tokens saved correctly. Keep these minimal — this isn't the phase for real UI design.

Go ahead and implement.

Want me to adjust anything in that before you send it, or is this good as-is?

we didnt set up the real authorization yet so do we do that once the connection endpoints are there

Right — you've got the sequencing correct. Once these endpoints exist and are verified working, that's exactly when the real authorization step happens, not before. Here's the precise order from where you'll be after this phase lands:

1. Phase 1 finishes (in progress now) — connectors/quickbooks/ built, /api/quickbooks/connect and /callback routes exist, getQuickBooksAccessToken with refresh logic implemented, stub /connected and /error pages in place.

2. Test it yourself first, in Development — before touching Stacy's real company, run the whole flow against your own Development Client ID + sandbox company: hit /connect, get redirected to Intuit, authorize a sandbox company, land on /callback, confirm tokens actually land in ConnectorCredential (query it directly, same discipline as the migration checks), then force-expire and confirm the refresh path actually works. This is the "Phase 2 — verify end-to-end" step from the earlier plan, just now running against real code instead of a stub.

3. Only after that passes — move to Production setup. This is the still-pending checklist from before: Production Key Requirements form, the compliance questionnaire (~30-40 min, last known status: untouched), legal docs (Privacy Policy/EULA URLs — still needs Christian/Rob), Production Client ID/Secret, and registering the real deployed Redirect URI (https://hq.launchpadinc.org/api/quickbooks/connect and .../callback, whatever the final deployed domain is) under Production → Redirect URIs.

4. Only after Production is fully configured and deployed — that's when you build the real authorization link and get on the call with Stacy.

So: not yet — the real authorization with Stacy is still gated behind (2) working cleanly in dev and (3) Production being unlocked, both of which are separate from what's being built right now. Sending Stacy a link before step 2 passes would mean testing a brand-new OAuth implementation live, on a real client's financial data, with no dry run — worth avoiding even under time pressure.

Want me to draft the dev-testing checklist as a literal step-by-step for step 2, so you have something concrete to run through once Claude Code confirms Phase 1 is built?


Phase 1 complete — QuickBooks connector rebuilt, following Aplos's exact conventions

connectors/quickbooks/ (new package, @lp-ai/connector-quickbooks):
- quickbooks-client.ts — buildAuthorizationUrl(state), exchangeCodeForTokens(code), saveQuickBooksCredentials(...), getQuickBooksAccessToken(realmId). Matches Aplos's loadEnv()-inside-the-function convention and 60s expiry buffer, but — per your explicit instruction — has no in-memory cache: every call re-reads ConnectorCredential from the DB, and a refresh always writes the rotated pair back before returning.
- errors.ts — QuickBooksNotConnectedError (no credential row) and QuickBooksReauthRequiredError (Intuit returns invalid_grant on refresh), both typed and distinguishable via instanceof.
- index.ts — sync() noop stub wired through runSync('quickbooks', ...), satisfying the connector contract from CLAUDE.md; re-exports the client functions.
- cli.ts — identical shape to aplos/cli.ts.
- quickbooks-client.test.ts — mocks @lp-ai/lib-db and @lp-ai/lib-config (permissions.ts-style), covers all 4 branches: missing row, not-expired (no fetch call), expired-and-refreshed (asserts the upsert payload), and refresh-rejected → QuickBooksReauthRequiredError. All 4 pass.

apps/hq: app/api/quickbooks/connect/route.ts (new — builds the auth URL, sets a signed httpOnly state cookie scoped to /api/quickbooks) and callback/route.ts (rebuilt — validates state against that cookie before exchanging the code, deletes the cookie after). Both are thin wrappers importing from the connector package, per the approved split. Added the two stub pages (/quickbooks/connected, /quickbooks/error) — minimal, no real UI, just confirmation/error text.

Config: already done from the earlier session, confirmed untouched.

Two real bugs caught during verification (not just claimed — actually built and typechecked/tested this time):
1. My own test had vi.restoreAllMocks() silently wiping the loadEnv mock's return value every test — fixed by making it a plain async function instead of a vi.fn().
2. apps/hq/Dockerfile still referenced apps/aws-mcp-server, connectors/google-drive, connectors/notion, connectors/slack — all deleted in the Elevate215 restructure. This was a real oversight from that earlier phase (I'd fixed apps/sync/Dockerfile but missed this one), and it would have broken the HQ Docker build outright. Fixed alongside adding the new connector-quickbooks COPY/build lines.

Verified for real this time: built packages/config, packages/db, packages/embedding, and the new connector from source via tsc (working around the environment's pnpm-install limitation by manually replicating the exact symlink structure pnpm itself uses). apps/hq and apps/mcp-server both typecheck with zero errors — the first time in this whole engagement I've been able to confirm that rather than caveat around it.

Not done, correctly out of scope: no migration was run (none needed — ConnectorCredential already exists); no actual QuickBooks accounting-data sync logic (that's Phase 2); no Production Intuit dashboard changes.
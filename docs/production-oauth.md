# GitHub App OAuth for Marvin

The web sign-in flow is implemented. It uses a GitHub App, PostgreSQL, encrypted server-side credentials, and opaque browser sessions. It is separate from `npm run copilot:login`, which only tests a local CLI profile.

The implementation targets **GitHub.com and api.github.com**, including organizations using Enterprise Cloud on GitHub.com. Custom GitHub Enterprise Server hosts and separate `ghe.com` data-residency domains are not configured by this implementation. Confirm your corporate account's host before testing.

## 1. Register the GitHub App

Create a GitHub App owned by your organization, with its administrator's approval. Use a separate registration for development and production.

| Setting | Local development | Production example |
| --- | --- | --- |
| Homepage | `http://127.0.0.1:3000` | `https://marvin.example.com` |
| Callback URL | `http://127.0.0.1:3000/api/auth/github/callback` | `https://marvin.example.com/api/auth/github/callback` |
| Webhook URL | A reachable development HTTPS ingress, when testing webhooks | `https://marvin.example.com/api/auth/github/webhook` |

Use the **Client ID**, not the App ID, and generate a client secret. A private key or installation access token is not used for this user authorization flow. Keep expiring user access tokens enabled so refresh is exercised.

Grant **Organization permissions → Members → Read-only**, then install/approve the app in the organization(s) you allow. The membership endpoint used by Marvin requires this permission for GitHub App user tokens. No repository write permissions are needed by this implementation. [GitHub organization membership API](https://docs.github.com/en/rest/orgs/members#get-an-organization-membership-for-the-authenticated-user)

Configure a webhook secret. GitHub Apps receive the `github_app_authorization` event when a user revokes authorization; Marvin validates its signature and removes that user's sessions and stored credentials. Production requires the secret to be configured, and the webhook must be reachable. Local sign-in can be tested without webhook delivery. [GitHub webhook event reference](https://docs.github.com/en/webhooks/webhook-events-and-payloads#github_app_authorization)

A successful GitHub sign-in does not prove Copilot access. The user's subscription, app approval, SSO, IP restrictions, enabled models, and enterprise policy still apply. Start the organization's SSO session before authorizing if your organization requires it. [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## 2. Configure the server

Use Node.js 22.9+ and a supported PostgreSQL deployment. Copy `.env.example` to `.env.local` for local testing, then fill in the values. Do not commit `.env.local` or send credentials in chat. In production, inject them using your deployment's secret manager.

| Variable | Meaning |
| --- | --- |
| `AUTH_MODE=github` | Require web sign-in in development. Production always requires it. |
| `APP_ORIGIN` | Exact external origin, without a path. HTTPS is mandatory in production; loopback HTTP is allowed in development. |
| `GITHUB_CLIENT_ID` | GitHub App client ID. |
| `GITHUB_CLIENT_SECRET` | GitHub App client secret. |
| `GITHUB_ALLOWED_ORGS` | Comma-separated organization logins, e.g. `engineering-org,research-org`. At least one is required. Active membership in any listed organization grants access. |
| `AUTH_ENCRYPTION_KEY` | Exactly 32 random bytes encoded as base64. All replicas must share the same key. |
| `GITHUB_WEBHOOK_SECRET` | Independent random secret matching the app's webhook configuration. Required in production. |
| `DATABASE_URL` | PostgreSQL connection string for the dedicated auth database. Verify TLS certificates for remote databases. |

Generate the encryption key locally, then generate a separate value for the webhook secret:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

There are no `NEXT_PUBLIC_` credentials. No provider access token or refresh token is sent to the browser.

Run the schema setup before starting the app:

```powershell
npm ci
npm run auth:migrate
npm run dev
```

The migration reads `.env.local` and creates the three auth tables in `db/001-auth.sql`. Run migrations as a deployment step with schema privileges; a dedicated runtime database role only needs data access to those tables. Migration tooling uses the project's development dependencies, so run it before pruning those dependencies or in a separate deployment job.

For a production build behind an HTTPS reverse proxy:

```powershell
npm run build
npm run start
```

The default server binds to `127.0.0.1`. If a container ingress needs a network listener, start with `npm exec -- next start --hostname 0.0.0.0 --port 3000`. Keep `APP_ORIGIN` set to the public HTTPS origin. Redirects and mutation checks use this configured origin rather than trusting forwarded host headers.

Without OAuth configuration, development still supports the existing mock workspace. Setting `AUTH_MODE=demo` only permits this in development. Production ignores demo mode and fails closed when authentication is missing or misconfigured.

## 3. Validate in the corporate environment

1. Open the exact configured origin and select **Sign in with GitHub**. Complete authorization with an active member of an allowed organization.
2. Confirm the GitHub identity shown in the sidebar and **Copilot connection** page.
3. Select **Check Copilot access**. This checks membership again, starts an isolated SDK runtime using the user's stored token, and discovers available models. It sends no model prompt.
4. Choose a model and select **Send test greeting**. This uses that user's Copilot allowance. Success means a real model response appeared, not just that OAuth succeeded.
5. Test **Sign out** and verify that opening a protected route in a fresh request requires sign-in. Another browser session should remain signed in.
6. Test **Disconnect GitHub**. It revokes the user's entire authorization grant for this app and ends all of that user's Marvin sessions. Other users should remain unaffected. Sign in again to reconnect.
7. Revoke the app from GitHub settings and verify webhook delivery returns 200 and existing sessions stop working. Check rejection with a nonmember account and with an app blocked by organization policy.
8. Verify a session survives a server restart and that a user token refreshes after expiry. Keep the database and encryption key unchanged across replicas/restarts.

Never replace failures with hard-coded tokens or disable certificate verification to make the test pass. Trust your organization's CA through the approved runtime configuration (for example `NODE_EXTRA_CA_CERTS`) and use the approved proxy settings. The SDK child process receives proxy/CA settings but no ambient GitHub tokens, database connection strings, app secrets, or encryption key. Proxy handling and Copilot endpoints must still be validated on your network.

## Implemented behavior

- Authorization-code flow with S256 PKCE, a random browser-bound state cookie, ten-minute expiry, and atomic one-time state consumption.
- Seven-day application sessions with random opaque identifiers. Only their SHA-256 hashes are stored in PostgreSQL. HTTPS cookies use `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/` without a Domain attribute.
- Access/refresh tokens encrypted using AES-256-GCM with user-specific authenticated context. PKCE verifiers are also encrypted at rest.
- Identity and active organization membership checks on sign-in, on every Copilot operation, and at most every five minutes for ordinary authenticated page/session reads. Revocation webhooks invalidate sessions immediately when delivered.
- Refresh within a minute of token expiry, serialized using a PostgreSQL row lock. Updated credentials commit even if a later membership API call fails, avoiding loss of a rotated refresh token. Provider errors fail closed.
- Same-origin checks on logout, disconnect, and authenticated Copilot POST requests. Bounded Copilot/webhook bodies; no provider errors or credentials echoed to clients.
- User identity comes from the session. Clients cannot select another execution owner or supply a provider token in a request.
- One active diagnostic per user per application process, up to eight concurrently per process, plus a PostgreSQL-backed six-checks-per-minute limit per user across sessions and replicas.
- Fresh temporary SDK directories, explicit per-user tokens, disabled local credential fallback, tools denied, and runtime cleanup after each check. A 40-second timeout bounds each diagnostic; this is not the future council token-budget implementation.
- Protected workspace routes and a public landing page. The original councils remain browser-local simulations, now namespaced by GitHub user ID in OAuth mode. Demo chat participants and approvals remain simulated; web sign-in does not turn those into real multi-user councils.

## Operations and remaining boundaries

Schedule `npm run auth:cleanup` in your deployment to remove expired login attempts/sessions and clear credentials inactive for at least seven days without a live session. This command does not run automatically. Sign-out deletes the current session; disconnect revokes the provider grant and clears credentials. Protect auth database backups as well as the encryption key. Key replacement requires an explicit credential/session migration or users signing in again; there is no automatic key-rotation service.

Use a persistent Node deployment that can run the SDK's child process and access a writable temporary directory. This is not an Edge runtime or a serverless council worker. Configure request limits at ingress, particularly on the public login endpoint, and redact cookies, authorization headers, and OAuth callback query parameters from access logs. The application deliberately does not log provider response bodies or credentials.

Already-running diagnostics may finish within their timeout when logout/revocation happens; subsequent authenticated requests are denied. A global job scheduler, cross-replica running-job cancellation, per-council owner assignment, and long-running background councils are separate future work.

This change has automated SQL/service, route-handler, and browser tests with simulated provider responses. PGlite runs the actual schema and SQL in an embedded PostgreSQL engine; it is a test dependency only. A live external PostgreSQL service, registered GitHub App, corporate SSO/proxy policies, webhook delivery, and an entitled Copilot response still need the environment validation above. Do not describe those as already verified.

## Corporate agent handoff

> Use the existing production OAuth implementation rather than rebuilding it. Register/configure the GitHub App and PostgreSQL as described here, apply the migration, and run the acceptance steps. Preserve PKCE, state validation, organization checks, encryption, secure cookies, and explicit per-user SDK credentials. Report separately whether web authorization, identity, model discovery, chat, refresh, logout, and webhook revocation passed. Investigate corporate host, SSO, app policy, proxy, and CA failures without bypassing controls. Live council orchestration remains outside this authentication validation.

The SDK integration follows GitHub's [OAuth setup](https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth) and [token refresh lifecycle](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

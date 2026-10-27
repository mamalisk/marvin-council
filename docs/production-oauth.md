# GitHub App OAuth for Marvin

Reviewed against the implementation and provider documentation on 27 October 2026. Production origin: **https://marvin-council.vercel.app**.

## Production values at a glance

Enter these URLs in the **production GitHub App** settings:

```text
Homepage URL: https://marvin-council.vercel.app
Callback URL: https://marvin-council.vercel.app/api/auth/github/callback
Webhook URL: https://marvin-council.vercel.app/api/auth/github/webhook
```

Set these environment variables in the **Vercel project → Settings → Environment Variables → Production**. Replace every placeholder with the appropriate value; placeholders are not working credentials.

```dotenv
AUTH_MODE=github
APP_ORIGIN=https://marvin-council.vercel.app
GITHUB_CLIENT_ID=<set in Vercel; do not store credentials here>
GITHUB_CLIENT_SECRET=<set in Vercel; do not store credentials here>
GITHUB_ALLOWED_USERS=mamalisk
GITHUB_ALLOWED_ORGS=
AUTH_ENCRYPTION_KEY=<set in Vercel; do not store credentials here>
GITHUB_WEBHOOK_SECRET=<set in Vercel; do not store credentials here>
DATABASE_URL=<production Neon PostgreSQL connection string>
```

This example allows the personal GitHub account `mamalisk`. Leave `GITHUB_ALLOWED_ORGS` unset or empty for personal-only testing. Deploy the code containing personal-user allowlist support; redeploying an older commit will still require an organization. For corporate use, remove the personal allowlist and configure the organization's login instead. If both lists are populated, either an explicitly listed user or active membership in a listed organization grants access. Empty lists never enable public sign-up.

Preserve existing production secrets when they are already configured, especially `AUTH_ENCRYPTION_KEY`. Keep real credentials in Vercel or ignored local environment files, not this guide. Redeploy after saving changes. For local development, use `APP_ORIGIN=http://127.0.0.1:3000` and the separate development credentials. The full registration, migration, and validation steps follow.

The web sign-in flow is implemented. It uses a GitHub App, PostgreSQL, encrypted server-side credentials, and opaque browser sessions. It is separate from `npm run copilot:login`, which only tests a local CLI profile.

The implementation targets **GitHub.com and api.github.com**, including organizations using Enterprise Cloud on GitHub.com. Custom GitHub Enterprise Server hosts and separate `ghe.com` data-residency domains are not configured by this implementation. Confirm your corporate account's host before testing.

## 1. Register the GitHub App

For corporate deployment, create a GitHub App owned by your organization, with its administrator's approval. For personal testing, a personally owned GitHub App and an explicit `GITHUB_ALLOWED_USERS` entry are sufficient; no organization is required. Use a separate registration for development and production. In GitHub, use **Settings → Developer settings → GitHub Apps → New GitHub App**, rather than OAuth Apps, for this implementation's permission and revocation setup. This is a separate app from the Vercel GitHub integration used to import the repository.

| Setting | Local development | Production |
| --- | --- | --- |
| Homepage | `http://127.0.0.1:3000` | `https://marvin-council.vercel.app` |
| Callback URL | `http://127.0.0.1:3000/api/auth/github/callback` | `https://marvin-council.vercel.app/api/auth/github/callback` |
| Webhook URL | A reachable development HTTPS ingress, when testing webhooks | `https://marvin-council.vercel.app/api/auth/github/webhook` |

Use the **Client ID**, not the App ID, and generate a client secret. A private key or installation access token is not used for this user authorization flow. Keep expiring user access tokens enabled so refresh is exercised.

For organization-based access, grant **Organization permissions → Members → Read-only**, then install/approve the app in the organization(s) you allow. The membership endpoint used by Marvin requires this permission for GitHub App user tokens. Personal-only access checks the token's authenticated GitHub identity and does not call the organization membership endpoint or need the Members permission. A personally owned app can retain **Only on this account** for personal-only testing; allow organization installation when adopting organization access. No repository write permissions are needed by this implementation. [GitHub organization membership API](https://docs.github.com/en/rest/orgs/members#get-an-organization-membership-for-the-authenticated-user)

`GITHUB_ALLOWED_ORGS` accepts actual GitHub organization logins. `GITHUB_ALLOWED_USERS` accepts personal GitHub logins, such as `mamalisk`. Both are comma-separated, case-insensitive lists with up to ten distinct logins each; do not use URLs, `@` prefixes, or wildcards. At least one list must be nonempty. GitHub identities are verified server-side; clients cannot nominate an allowed username. Personal entries follow the GitHub login, so review the allowlist if an account is renamed. Sessions remain tied to GitHub's numeric user ID.

Configure a webhook secret. GitHub Apps receive the `github_app_authorization` event when a user revokes authorization; Marvin validates its signature and removes that user's sessions and stored credentials. Production requires the secret to be configured, and the webhook must be reachable. Local sign-in can be tested without webhook delivery. [GitHub webhook event reference](https://docs.github.com/en/webhooks/webhook-events-and-payloads#github_app_authorization)

A successful GitHub sign-in does not prove Copilot access. The user's subscription, app approval, SSO, IP restrictions, enabled models, and enterprise policy still apply. Start the organization's SSO session before authorizing if your organization requires it. [GitHub App user authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app)

## 2. Configure the server

Use Node.js **22.12+** (or a newer supported LTS release) and a supported PostgreSQL deployment. This minimum matches the installed Copilot SDK on Node 22. Copy `.env.example` to `.env.local` for a fresh local setup, or add the missing settings to your existing `.env.development.local` without replacing its database credentials. Do not commit environment files or send credentials in chat. In production, inject them using your deployment's environment settings or secret manager.

| Variable | Meaning |
| --- | --- |
| `AUTH_MODE=github` | Require web sign-in in development. Production always requires it. |
| `APP_ORIGIN` | Exact external origin, without a path. HTTPS is mandatory in production; loopback HTTP is allowed in development. |
| `GITHUB_CLIENT_ID` | GitHub App client ID. |
| `GITHUB_CLIENT_SECRET` | GitHub App client secret. |
| `GITHUB_ALLOWED_ORGS` | Optional comma-separated organization logins, e.g. `engineering-org,research-org`. Active membership in any listed organization grants access. |
| `GITHUB_ALLOWED_USERS` | Optional comma-separated personal logins. Use `mamalisk` for this personal deployment. Either this list or `GITHUB_ALLOWED_ORGS` must be nonempty. |
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

If you pulled Vercel Development variables into `.env.development.local`, use this instead of `npm run auth:migrate`:

```powershell
node --env-file=.env.development.local --import tsx scripts/auth-db.ts
npm run dev
```

Next.js loads `.env.development.local` during `npm run dev`; the standalone migration script does not automatically load Next.js environment files. Existing process environment variables take precedence over the explicit Node env file. Success prints `OAuth database schema is ready.` The script creates `marvin_auth_users`, `marvin_auth_sessions`, and `marvin_oauth_flows`, with indexes. It does not migrate council data out of localStorage.

### Vercel and Neon setup

1. Connect Neon PostgreSQL to the `marvin-council` Vercel project. Leave Neon Auth disabled; Marvin already implements authentication. Ensure the application receives the connection as `DATABASE_URL`, even if your integration uses another variable prefix. Use a pooled runtime connection and retain TLS verification.
2. Configure separate Development and Production database branches/resources and credentials. Pulling Development variables does not configure Production. The migration successfully ran on 27 October 2026 against the Neon endpoint in `.env.development.local`; this does not confirm that Vercel Production points to that same database or that its schema is ready.
3. In Vercel project environment settings, add every variable in the table above to **Production**, using the production GitHub App credentials. Set `APP_ORIGIN=https://marvin-council.vercel.app`. Keep the encryption key stable across redeployments. For local development, use `APP_ORIGIN=http://127.0.0.1:3000` and the development GitHub App credentials.
4. Apply `db/001-auth.sql` to the intended production database through a controlled migration job or the Neon SQL editor. The current initial schema uses `CREATE ... IF NOT EXISTS` and can be rerun; that does not replace versioned migrations for future schema changes. Neither `next build` nor a Vercel deployment runs this migration automatically.
5. Deploy as a Next.js project, with `npm run build` and the framework's default output settings. Vercel manages the web runtime; the container `npm run start` instructions below do not apply. Redeploy after changing environment variables so the new deployment receives them. [Vercel environment variables](https://vercel.com/docs/environment-variables), [Marketplace storage](https://vercel.com/docs/marketplace-storage)
6. Test sign-in using the stable production domain above. Arbitrary preview deployment URLs will not work with this production origin: callbacks and mutation origin checks are deliberately tied to it. Give staging its own stable origin, app registration, secrets, and database if you need preview sign-in.
7. Ensure GitHub can POST to the webhook URL without encountering an interactive Vercel login/protection page. Check GitHub App **Advanced → Recent deliveries** and verify successful delivery. Keep Marvin's webhook signature verification enabled; setting the secret alone does not establish delivery.

Vercel deployment of the UI and OAuth routes does **not** verify Copilot SDK compatibility. The diagnostic starts a local child process; its packaged executable, temporary filesystem, network access, and function duration still need validation on Vercel. Full council workers and a remote SDK runtime adapter are not implemented. If the runtime cannot operate there, it needs a separate execution service. Do not describe the hosted model check or chat as working until the acceptance steps pass.

### Diagnosing Copilot startup on Vercel

GitHub web sign-in and Copilot runtime authentication are separate steps. If the runtime has not started, the UI now reports **Copilot authentication not checked**. This is not evidence that the user's Copilot subscription was rejected.

The SDK dynamically resolves an optional `@github/copilot-sdk-<platform>` package containing its native runtime. Static Next.js tracing omitted this package in the original deployment configuration. `next.config.ts` now explicitly includes installed SDK platform packages for the Copilot routes. Keep optional dependencies enabled during installation. `npm run build` now verifies that both route traces contain the matching platform package metadata, executable, and `runtime.node`; an incomplete bundle fails the build. The authenticated route requests a 90-second host allowance around the existing bounded 40-second probe and authentication/cleanup work. Verify the deployment plan honors that allowance.

After deploying this change, run **Check Copilot access** again. The UI returns a fixed diagnostic code on failure; Vercel runtime logs contain `marvin.copilot.probe` with only its stage and code, without provider stderr, paths, or credentials.

| Diagnostic code | Meaning / next check |
| --- | --- |
| `runtime_missing` | Runtime package or executable is missing. Check the deployed commit, optional dependencies, and build verification output. |
| `runtime_permission` / `runtime_readonly` | Check executable permissions and temporary-directory access on the host. |
| `runtime_start_failed` | Startup failed for another reason; verify native runtime compatibility with the host. |
| `probe_timeout` | The probe exceeded its own deadline; the reported stage identifies startup, authentication, model discovery, or chat. |
| `authentication_check_failed` | Runtime started, but the authentication request failed; entitlement is not yet established. |
| `copilot_unauthenticated` | Runtime returned an unauthenticated result; check the user's Copilot access and GitHub App policies. |
| `model_discovery_failed` / `chat_failed` | Authentication completed; check model availability, allowance, policy, and network access. |

Local tests and build tracing verify packaging and failure reporting, not a successful hosted Copilot response. Retest the deployed Linux runtime before treating Vercel support as proven.

### Container or persistent Node deployment

For a production build behind an HTTPS reverse proxy:

```powershell
npm run build
npm run start
```

The default server binds to `127.0.0.1`. If a container ingress needs a network listener, start with `npm exec -- next start --hostname 0.0.0.0 --port 3000`. Keep `APP_ORIGIN` set to the public HTTPS origin. Redirects and mutation checks use this configured origin rather than trusting forwarded host headers.

Without OAuth configuration, development still supports the existing mock workspace. Setting `AUTH_MODE=demo` only permits this in development. Production ignores demo mode and fails closed when authentication is missing or misconfigured.

## 3. Validate in the corporate environment

1. Open the exact configured origin and select **Sign in with GitHub**. Complete authorization with an explicitly allowed personal account or an active member of an allowed organization.
2. Confirm the GitHub identity shown in the sidebar and **Copilot connection** page.
3. Select **Check Copilot access**. This checks the user/organization access policy again, starts an isolated SDK runtime using the user's stored token, and discovers available models. It sends no model prompt.
4. Choose a model and select **Send test greeting**. This uses that user's Copilot allowance. Success means a real model response appeared, not just that OAuth succeeded.
5. Test **Sign out** and verify that opening a protected route in a fresh request requires sign-in. Another browser session should remain signed in.
6. Test **Disconnect GitHub**. It revokes the user's entire authorization grant for this app and ends all of that user's Marvin sessions. Other users should remain unaffected. Sign in again to reconnect.
7. Revoke the app from GitHub settings and verify webhook delivery returns 200 and existing sessions stop working. Check rejection with an account absent from both access paths and, when using organizations, with an app blocked by organization policy. Remove a personally allowed user, deploy the updated configuration, and verify the next Copilot check is denied; ordinary page/session access is rechecked at most every five minutes.
8. Verify a session survives a server restart and that a user token refreshes after expiry. Keep the database and encryption key unchanged across replicas/restarts.

Never replace failures with hard-coded tokens or disable certificate verification to make the test pass. Trust your organization's CA through the approved runtime configuration (for example `NODE_EXTRA_CA_CERTS`) and use the approved proxy settings. The SDK child process receives proxy/CA settings but no ambient GitHub tokens, database connection strings, app secrets, or encryption key. Proxy handling and Copilot endpoints must still be validated on your network.

## Implemented behavior

- Authorization-code flow with S256 PKCE, a random browser-bound state cookie, ten-minute expiry, and atomic one-time state consumption.
- Seven-day application sessions with random opaque identifiers. Only their SHA-256 hashes are stored in PostgreSQL. HTTPS cookies use `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax`, and `Path=/` without a Domain attribute.
- Access/refresh tokens encrypted using AES-256-GCM with user-specific authenticated context. PKCE verifiers are also encrypted at rest.
- Identity and access-policy checks (explicit personal user or active organization membership) on sign-in, on every Copilot operation, and at most every five minutes for ordinary authenticated page/session reads. Revocation webhooks invalidate sessions immediately when delivered.
- Refresh within a minute of token expiry, serialized using a PostgreSQL row lock. Updated credentials commit even if a later membership API call fails, avoiding loss of a rotated refresh token. Provider errors fail closed.
- Same-origin checks on logout, disconnect, and authenticated Copilot POST requests. Bounded Copilot/webhook bodies; no provider errors or credentials echoed to clients.
- User identity comes from the session. Clients cannot select another execution owner or supply a provider token in a request.
- One active diagnostic per user per application process, up to eight concurrently per process, plus a PostgreSQL-backed six-checks-per-minute limit per user across sessions and replicas.
- Fresh temporary SDK directories, explicit per-user tokens, disabled local credential fallback, tools denied, and runtime cleanup after each check. A 40-second timeout bounds each diagnostic; this is not the future council token-budget implementation.
- Protected workspace routes and a public landing page. The original councils remain browser-local simulations, now namespaced by GitHub user ID in OAuth mode. Demo chat participants and approvals remain simulated; web sign-in does not turn those into real multi-user councils.

## Operations and remaining boundaries

Schedule `npm run auth:cleanup` in your deployment to remove expired login attempts/sessions and clear credentials inactive for at least seven days without a live session. This command does not run automatically. Sign-out deletes the current session; disconnect revokes the provider grant and clears credentials. Protect auth database backups as well as the encryption key. Key replacement requires an explicit credential/session migration or users signing in again; there is no automatic key-rotation service.

For the existing SDK integration, a persistent Node deployment that can run the child process and access a writable temporary directory remains the baseline. The Vercel-specific validation boundary is described above. This is not an Edge runtime or a serverless council worker. Configure request limits at ingress, particularly on the public login endpoint, and redact cookies, authorization headers, and OAuth callback query parameters from access logs. The application deliberately does not log provider response bodies or credentials.

Already-running diagnostics may finish within their timeout when logout/revocation happens; subsequent authenticated requests are denied. A global job scheduler, cross-replica running-job cancellation, per-council owner assignment, and long-running background councils are separate future work.

This change has automated SQL/service, route-handler, and browser tests with simulated provider responses. PGlite runs the actual schema and SQL in an embedded PostgreSQL engine; it is a test dependency only. The configured local-development Neon connection and initial schema application were verified on 27 October 2026. Production database wiring, live GitHub authorization, corporate SSO/proxy policies, webhook delivery, refresh, and an entitled Copilot response still need the environment validation above. Do not describe those as already verified.

## Corporate agent handoff

> Use the existing production OAuth implementation rather than rebuilding it. Register/configure the GitHub App and PostgreSQL as described here, apply the migration, and run the acceptance steps. Preserve PKCE, state validation, organization checks, encryption, secure cookies, and explicit per-user SDK credentials. Report separately whether web authorization, identity, model discovery, chat, refresh, logout, and webhook revocation passed. Investigate corporate host, SSO, app policy, proxy, and CA failures without bypassing controls. Live council orchestration remains outside this authentication validation.

The SDK integration follows GitHub's [OAuth setup](https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth) and [token refresh lifecycle](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens).

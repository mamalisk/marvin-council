# Marvin Council

The approved Marvin mockups ported to a Next.js App Router application with React and TypeScript. The council workspace is an interactive product prototype. GitHub App OAuth, server-side sessions, and a real Copilot SDK connectivity test are implemented separately from the simulated councils.

## Run locally

Use Node.js 22.9+ and npm. From this directory:

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000 and choose **Explore the demo**. The app binds to loopback. No environment variables or GitHub App registration are needed to explore the mock workspace.

## What works in the prototype

- Landing page, Marvin dashboard, previous councils, recurring council starter, dark/light themes, and responsive layouts.
- Marketplace for agents, skills, and traits: create, customize, search, select, import, and export Markdown definitions.
- Four-step council setup: GROW scope and specialists; uploaded or sample Delphi context; parallel briefing simulation; live/offline mode, sample invitees, token/time limits, and approval quorum.
- Document assignment to all or selected agents. Every human can inspect every council document.
- Council chat with named specialists, @mentions, quoted replies, structured questions, sample citations, context previews, and an editable voice-transcription preview.
- Revision-specific human approvals, approval invalidation after an answer changes, and Markdown specification export.
- Follow-up councils: start from an existing council or choose previous outcomes during setup. Specifications are captured as fixed input revisions with approval status, source links, downstream links, and lineage in Markdown exports. Each new council sets its own goal and approvals; later source edits do not alter captured inputs.
- Browser persistence for councils, drafts, documents, definitions, and theme preferences.

**Council deliberation, ingestion, usage meters, invitations, council participants, and transcription are simulated.** No microphone recording, multi-user synchronization, live Delphi search, model execution, real budget enforcement, or billing happens in the council UI. The local upload prototype reads Markdown/text; binary files retain metadata only. Data stays in browser localStorage and is not shared between devices. Clear the `marvin-council.workspace.v1` key to reset the demo. OAuth mode namespaces this prototype storage by GitHub user ID and shows the real signed-in identity in the sidebar; simulated council participants remain explicitly separate.

## Test real GitHub Copilot access

The connection screen at `/connection` uses the official `@github/copilot-sdk`. The commands below test the local CLI profile in demo mode. For web OAuth and corporate deployment, follow [Production OAuth setup](docs/production-oauth.md).

1. In your own terminal, run:

   ```powershell
   npm run copilot:login
   ```

   Complete the official CLI's browser authorization with your GitHub account. The script resolves the CLI version matching the installed SDK and downloads it through npm if needed. It sets `COPILOT_HOME` to this project's ignored `.copilot-local` directory; the CLI may also use the operating system's credential store. Never paste credentials into the chat, source code, or browser storage. Your account and organization policy must permit Copilot access.

2. With `npm run dev` running, open **Copilot connection** and click **Check Copilot access**. It starts the SDK runtime, checks authentication, and lists models without sending a chat prompt. Equivalent terminal command:

   ```powershell
   npm run copilot:check
   ```

   Exit code 1 means authentication is absent or the diagnostic failed. The result reports the authentication type; existing environment credentials or CLI credential resolution can affect which account is selected. Check the reported identity before sending a prompt.

3. Select an available model and click **Send test greeting**. This sends one short real prompt with tools disabled and uses your Copilot allowance. No council documents are sent. Terminal equivalent, using an actual model ID returned by step 2:

   ```powershell
   npm run copilot:check -- --chat --model <model-id>
   ```

The diagnostic has a 40-second overall timeout, a 25-second response wait, denies tool permissions, and stops the runtime afterward. Its web endpoint only accepts same-origin requests to a local development address and is disabled by `npm run start` in production mode. It is not the production council API or token-budget controller.

Verified during the port: the SDK runtime starts and accurately reports the local profile as unauthenticated. **Successful browser authorization, model discovery, and a real chat response still require your sign-in and have not been claimed as verified.**

See GitHub's [CLI authentication guide](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/authenticate-copilot-cli) and [SDK GitHub OAuth guide](https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth).

## Production web OAuth

The web flow is implemented using a GitHub App, PostgreSQL-backed sessions, encrypted server-side tokens, S256 PKCE/state validation, explicit user allowlists or active organization membership checks, token refresh, sign-out, disconnect/revocation, and signed revocation webhooks. Each SDK check receives the authenticated user's token with local credential fallback disabled.

1. Register the GitHub App with callback `/api/auth/github/callback`, Members read permission, expiring user tokens, and webhook `/api/auth/github/webhook`.
2. Configure `.env.local` from `.env.example`, including the exact `APP_ORIGIN`, allowed users or organizations, database, encryption key, and GitHub secrets.
3. Run `npm run auth:migrate`, restart the app, and use **Sign in with GitHub**.
4. Validate the real signed-in account, available models, chat, and lifecycle operations using [the corporate acceptance steps](docs/production-oauth.md).

Production requires HTTPS and authentication; missing configuration fails closed. `/api/copilot` uses web sessions, while `/api/copilot/check` remains a development-only CLI diagnostic. The current provider hosts are GitHub.com/api.github.com. Corporate authentication and real chat still require your registered app and account to verify. Future council owner assignment and background orchestration are not implemented by this change.

## Validation

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Playwright uses installed Google Chrome and starts an isolated development server on port 3002 using `.next-e2e`. Domain tests cover context routing, immutable snapshots, launch boundaries, approvals, and Markdown formats. Auth tests run the actual SQL against embedded PostgreSQL and exercise the route handlers, state/PKCE, cookies, session isolation, refresh, revocation, and request restrictions. Browser tests cover the council flows and both local and OAuth Copilot UI states. Provider responses are mocked in automated tests; no model allowance is spent. Screenshots and traces are written to ignored `test-results/`.

## Structure and next work

- `src/app`: Next.js routes, OAuth endpoints, and local/authenticated SDK checks.
- `src/components`: screens and browser workspace provider.
- `src/lib/workspace.ts`: typed mock domain, document routing, and Markdown formats.
- `src/lib/copilot-probe.ts`: server/terminal SDK diagnostic.
- `src/lib/auth`: OAuth, token encryption, session storage, and access checks.
- `db/001-auth.sql`: PostgreSQL auth schema.
- `scripts`: official CLI sign-in and SDK status/chat commands.
- `docs/product-plan.md`: agreed product direction.

Next: validate web OAuth/Copilot against the corporate account and deployment, then implement council orchestration. Real councils need persisted durable state, parallel isolated specialists, Delphi citation retrieval, moderator coordination, shared token/time accounting with explicit extensions, and authenticated human collaboration. Delphi API details and the existing Marvin YAML plan schema are still required. Figma previews and real speech transcription are pending. Cost attribution/splitting remains a product decision.

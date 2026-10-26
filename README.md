# Marvin Council

The approved Marvin mockups ported to a Next.js App Router application with React and TypeScript. This is a local, interactive product prototype plus a separate real GitHub Copilot SDK connectivity test.

## Run locally

Use Node.js 22 LTS or newer and npm. From this directory:

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
- Browser persistence for councils, drafts, documents, definitions, and theme preferences.

**Council deliberation, ingestion, usage meters, invitations, identities, and transcription are simulated.** No microphone recording, multi-user synchronization, live Delphi search, model execution, real budget enforcement, or billing happens in the council UI. The local upload prototype reads Markdown/text; binary files retain metadata only. Data stays in browser localStorage and is not shared between devices. Clear the `marvin-council.workspace.v1` key to reset the demo. Do not treat this unauthenticated prototype as a deployed internal service.

## Test real GitHub Copilot access

The connection screen at `/connection` uses the official `@github/copilot-sdk`. This is a local SDK experiment, separate from future Marvin web authentication.

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

## Future web OAuth setup

The CLI test does not require you to register an application. For Marvin's eventual multi-user web sign-in:

1. Register a development **GitHub App** under your GitHub developer settings. Configure the homepage as `http://127.0.0.1:3000`. Reserve `http://127.0.0.1:3000/api/auth/github/callback` as the local callback; **this route is not implemented yet**. Follow GitHub's SDK OAuth guide for the current required user permissions and organization configuration.
2. Keep the app's client ID and generated client secret in a local ignored `.env.local` (proposed names: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`). These variables are not consumed by this prototype. Never use a `NEXT_PUBLIC_` prefix for secrets.
3. Implement server-side authorization-code exchange, state and PKCE checks, secure application sessions, token storage/refresh/revocation, and organization membership checks. Pass the designated session owner's authorized user token to the SDK on the server. A GitHub login alone does not establish Copilot entitlement.
4. Keep human identity separate from the council execution owner. Do not store shared owner credentials in the browser or reuse the local diagnostic as a hosted authentication flow.

## Validation

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Playwright uses installed Google Chrome and starts or reuses the development server. Domain tests cover context routing, immutable session snapshots, launch boundaries, approval revision semantics, Markdown round-tripping, and diagnostic origin restrictions. Browser tests cover the marketplace, complete council creation/review/export flow, mobile layout, and the unauthenticated Copilot UI. Browser tests stub Copilot responses and do not spend model allowance. Screenshots and traces are written to ignored `test-results/`.

## Structure and next work

- `src/app`: Next.js routes and the development-only SDK diagnostic endpoint.
- `src/components`: screens and browser workspace provider.
- `src/lib/workspace.ts`: typed mock domain, document routing, and Markdown formats.
- `src/lib/copilot-probe.ts`: server/terminal SDK diagnostic.
- `scripts`: official CLI sign-in and SDK status/chat commands.
- `docs/product-plan.md`: agreed product direction.

Next: validate your Copilot sign-in/chat, then implement the production identity and orchestration boundary. Real councils need persisted durable state, parallel isolated specialists, Delphi citation retrieval, moderator coordination, shared token/time accounting with explicit extensions, and authenticated human collaboration. Delphi API details and the existing Marvin YAML plan schema are still required. Figma previews and real speech transcription are pending. Cost attribution/splitting remains a product decision.

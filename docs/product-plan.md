# Marvin Council — product plan

Updated: 2026-10-26. Status: discovery baseline, not an implementation specification.

This document distinguishes confirmed requirements from proposed design and unresolved dependencies. Implementation update: the Next.js prototype, local SDK diagnostic, and GitHub App web OAuth flow now exist. See `docs/production-oauth.md` for the implemented authentication boundary, setup, and validation limits. Live council orchestration and Delphi integration remain pending.

## Purpose and success

Marvin Council is the internal, centralized web version of the existing Marvin project. Named N-amigo councils bring specialist agents and people together to refine software specifications and conduct product discovery. Both use cases are in scope for the first release.

Success means turning a stated goal, available knowledge, and participant feedback into a sufficiently complete specification for further development, with explicit unresolved questions where evidence is missing. A development plan must conform to the existing Marvin YAML schema, which the user will supply. Agents provide advisory recommendations; human reviewers approve the results.

## Confirmed requirements

### Councils and participation

- Support reusable named councils with multiple sessions, as well as ad hoc councils with selected people and agents.
- Support live workshops, unattended agent deliberation, late joining, and asynchronous contributions.
- A typical council has roughly four agents and one to three humans; asynchronous sessions may involve five to ten people. These are design examples, not hard limits.
- Support concurrent specialist agents within a session. Each agent has its own specialization, instructions, conversation context, and relevant knowledge retrieved from Delphi KB.
- Resume the same session when open questions are answered. Preserve its context and prior decisions.
- Allow eligible reviewers who did not participate in deliberation to approve outputs.
- Approval requires a configurable number of eligible human reviewers.

### Interaction and accessibility

- People can type messages, answers, and feedback.
- People can also dictate these contributions through voice transcription, similar to the interaction the user is using in Codex.
- Transcription is required for the first release. Full voice calls, meeting recording, and spoken agent responses have not been requested.
- The landing page presents authentication; the dashboard greets the user with Marvin and links to previous councils, new councils, and the agent/skill/trait marketplace.
- Session interaction centers on chat. Agents have names, answer questions, and can be addressed with @mentions. Support quoting and replying to a specific contribution or question.
- Explore structured response cards within chat for findings, citations, questions, proposals, and document previews. Render these through application-owned components rather than executing arbitrary agent-generated HTML.

### Agent marketplace

- The internal marketplace/catalog is a core first-release feature.
- Make existing agents easy to browse, inspect, select, and customize for councils.
- Allow users to create their own Markdown-configured agents and import/export Markdown definitions.
- Allow users to author reusable Markdown traits and skills. Traits express behavioral instructions; skills are optional.
- Agents combine their own instructions, selected traits, and optional skills.
- Initial specialists may include architect, developer, product owner, UX, and moderator agents. The exact starter catalog remains to be selected.
- Externally hosted agents and a public paid marketplace are outside the initial scope.

### Session structure and budgets

- Use GROW as the meeting framing: Goal, Reality, Options, and Way forward.
- Participants supply the desired outcome, starting specification, and relevant context and refine the specification during discussion.
- Agents deliberate under a moderator and produce a recommendation with unresolved questions where appropriate.
- Cap cumulative active agent processing at one hour per session, with explicit extensions.
- Time waiting for people does not consume the processing allowance.
- Resuming a session does not reset the cumulative allowance.
- Require a configurable cumulative token limit across all specialist agents, the moderator, and synthesis work. Parallel execution and resumption must not reset or multiply the allowance. The default amount remains to be chosen.
- Execute agents under a designated session owner's authorized GitHub Copilot account, including unattended processing.
- Cost allocation is under consideration: owner/project sponsorship versus splitting internally between participants or teams. No per-user charging or split policy has been selected.

### Inputs and integrations

- Accept uploaded Markdown and an inline Markdown editor for the starting specification and context.
- Council setup begins with GROW scope and selected specialists, followed by optional context from uploads or Delphi. Documents can be assigned to all agents or specific agents; every human participant with access to the council can access every council document.
- When documents are present, provide a briefing/ingestion phase with per-agent progress before launching live or offline deliberation. Each specialist digests its assigned context in parallel. Production progress must reflect actual processing states rather than invented percentages.
- Explore inviting people by GitHub username, with organization membership and identity verification. The exact directory lookup and invitation mechanism remain unresolved.
- GitHub Copilot support and GitHub OAuth authentication are required from day one; Microsoft Copilot is not the intended product.
- Use the models available through the organization's Copilot access, subject to validation.
- Delphi knowledge base is the sole initial external content connector. Its semantic search returns citations and is authenticated with a bearer token.
- The user will supply Delphi's API JSON. Its exact content, permission, and citation contracts are not yet known.
- Access Jira, Confluence, GitLab, and other source knowledge through Delphi initially; direct connectors are deferred.
- Figma previews are desired but unverified. Determine whether Delphi provides usable preview data before introducing a direct Figma dependency.
- External writes are deferred. Deliver downloadable documents initially.

### Outputs and deployment

- Produce Markdown artifacts and a plan conforming to the existing Marvin YAML schema.
- Expose an API as well as a web interface; frontend implementation may be prioritized.
- Support local development and testing.
- Hosting may be Azure or AWS; no choice has been made.
- Futuristic, entertaining, professional visual design inspired by the supplied Marvin images: rounded white forms, dark mechanical details, and green highlights. Theme selection remains open.

## Proposed product and technical design

The following are recommendations, not additional confirmed requirements.

### Domain model

Separate Council, Session, AgentTemplate, AgentVersion, TraitVersion, SkillVersion, SourceSnapshot, Finding, ArtifactRevision, and Approval.

A reusable council stores defaults. Each session snapshots its participating agent configurations and source versions. Ad hoc councils use the same session machinery without requiring users to establish a reusable team first.

Keep published templates, personal/team customizations, and session-specific overrides distinct. Downloadable Markdown should preserve useful metadata using a documented format; compatibility with the existing Marvin files must be examined before selecting that format.

### GROW workflow and disagreement

1. Goal: capture the decision, desired outcome, scope, and completion criteria.
2. Reality: ingest the current specification, retrieve cited context, and identify assumptions and missing evidence.
3. Options: collect independent specialist findings, then discuss material conflicts within bounded rounds.
4. Way forward: synthesize the specification, decisions, questions, actions, and YAML plan.
5. Human review: collect approvals against an immutable output revision.

GROW is the user-facing framing. It is not itself a voting or conflict-resolution algorithm.

Classify disagreements before resolving them: factual disputes require evidence; feasibility disputes may require experiments; business tradeoffs require a human decision. The moderator records material dissent and cannot turn lack of evidence into approval.

### State and approval

Track execution state separately from recommendation outcome and human approval state. A technically completed session can still have unresolved questions or insufficient evidence.

Candidate execution states: draft, ready, running, waiting_for_input, paused, budget_exhausted, completed, cancelled, failed. GROW phase is a separate field.

Approvals should identify the reviewer and the precise artifact revision. Proposed behavior: substantive revisions require new approvals, while older approvals remain in history. Define reviewer eligibility, quorum changes, and rejection behavior before implementation.

### Budget accounting

Proposed clock semantics: count elapsed wall time while a session's agent run is active, once for the session even if several agents work concurrently. Do not count human waiting time. Keep token/request usage separately because four simultaneous agents can consume more resources in the same elapsed minute.

Explicit extensions should be recorded. The confirmed session token limit, bounded turns, cancellation, and a reserved synthesis allowance should prevent discussion from consuming all resources. Token usage and provider billing units are separate measurements; validate actual Copilot metering and controls.

Proposed token accounting: sum model input and output usage across every call in every agent session, including moderator calls, repeated context, compaction, retries that consumed tokens, and final artifacts. Preserve cache/reasoning breakdowns where available without double-counting categories already included in totals. The model context-window limit is a separate constraint, not the cumulative session budget.

Use a persistent, atomic budget ledger shared by all workers. Reserve allowance before admitting concurrent work, reconcile reservations with reported usage, and keep synthesis allowance within the overall cap. Proposed controls include per-agent sublimits, visible usage warnings, and authorized extensions. Resume retains spent and reserved amounts. Missing usage is unknown, not zero; deduplicate live records and reconcile cumulative metrics after restart.

Strict enforcement requires control over each model call and enforceable output bounds, including internal SDK tool loops. Validate these capabilities in the integration test. Post-call usage reports and cancellation alone cannot guarantee zero overshoot for in-flight requests. If exact enforcement is unavailable, explicitly document that limitation and use conservative reservations and bounded work rather than presenting a soft threshold as a hard ceiling.

### Billing and internal allocation

Keep execution identity, provider billing account, and internal cost allocation distinct. The chosen session owner authorizes Copilot execution; GitHub's account and organization billing configuration determines the provider charge. Joining a council does not itself authorize charging another participant or spending their Copilot entitlement.

Recommended first-release policy: attribute each council to one sponsoring project/cost center, retain the owner's execution identity, and show transparent usage reports. Optional future allocation policies: equal shares among explicitly selected participants/teams, or agreed percentage shares. These are internal ledger allocations and do not split an individual provider request across Copilot accounts. Do not rotate participant credentials to spread charges.

Snapshot the selected allocation policy and beneficiaries; joining late must not silently redistribute earlier usage. Distinguish reported usage value from incremental invoiced cost, since included allowances and organization billing can differ. Keep transcription and other non-model costs separate. Monetary collection or payments are not authorized or in scope at this stage.

### Voice transcription

Provide a microphone control alongside the text composer. Proposed default: dictate, inspect/edit the transcript, then send through the same contribution pipeline as typed text.

Show recording/transcription status, support cancel/retry, and retain typing as a fallback. Avoid duplicate sends if transcription completes late. Do not assume audio is retained; decide audio handling, supported languages, and the transcription provider before connecting a service.

Copilot inference access does not establish speech-to-text capability. Treat transcription as a separate adapter and validate it independently. Live meeting capture and diarization are separate possible future features.

### Runtime and API

Provisional architecture: web client -> application API -> durable council orchestrator -> GitHub Copilot SDK/runtime, with separate Delphi and transcription adapters and persistent session/artifact storage.

Evaluate LangGraph for explicit state transitions, checkpointing, and human intervention. Add LangChain only where it provides a demonstrated benefit. Do not assume the Copilot SDK is a drop-in LangChain chat model; test the adapter boundary and avoid duplicating orchestration loops.

### Parallel specialist execution

Parallelism is a confirmed requirement. Proposed implementation: fan out independent review work into separate agent sessions, each receiving the shared brief plus its own role, traits, skills, context, and role-specific Delphi searches. Preserve citations and retrieval provenance with each finding. Shared source permissions continue to apply to all retrieval.

Keep each agent's working conversation separate. At defined discussion boundaries, the orchestrator shares selected findings and evidence; the moderator consolidates disagreements and requests targeted follow-up. Persist agent outputs separately, then merge them into versioned artifacts through a coordinated synthesis step to avoid conflicting document writes.

Use bounded concurrency with queues and backoff for Copilot and Delphi limits. All agents use the designated owner's authorization while retaining distinct session identities. Track per-agent progress, usage, cancellation, and failures, alongside the cumulative council budget. A failed or timed-out agent must be recorded as missing/partial participation rather than treated as agreement.

The local integration test must demonstrate concurrent specialist sessions with distinct contexts, independent Delphi retrieval, streamed progress, and cancellation across all active agents when the council stops. Confirm actual provider concurrency limits before selecting defaults. Concurrent elapsed time counts once toward the proposed wall-clock budget, while usage is aggregated across agents.

The application owns the marketplace, permissions, budgets, collaborative events, output revisions, and approvals. Its API should expose these domain objects independently of framework internals. Prototype API operations and streamed events before wiring a frontend to live agent execution.

The browser must not receive the owner's Copilot credentials or Delphi bearer token. Separate participant identity and permissions from the execution owner's Copilot entitlement. Validate organization restrictions, owner token expiry/revocation, unattended use, and isolation between sessions.

## Research evidence and limits

Reviewed 2026-10-26:

- GitHub documents OAuth user tokens passed to the Copilot SDK for multi-user applications: https://docs.github.com/en/copilot/how-tos/copilot-sdk/auth/authenticate
- GitHub describes OAuth application setup and user-attributed Copilot use: https://docs.github.com/en/copilot/how-tos/copilot-sdk/setup/github-oauth
- GitHub describes backend runtime deployment: https://github.com/github/copilot-sdk/blob/main/docs/setup/backend-services.md
- GitHub documents SDK token usage events and accumulated billing metrics; some metrics APIs are experimental and require version pinning: https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/usage-and-billing
- GitHub documents organization billing in AI credits based on model and token usage: https://docs.github.com/en/copilot/concepts/billing-and-usage/organizations-and-enterprises/billing
- LangChain describes the relationship between LangChain and LangGraph: https://www.langchain.com/oss-overview
- Voting or Consensus? reports task-dependent effects of decision protocols: https://arxiv.org/abs/2502.19130
- Debate or Vote reports strong independent-voting baselines on the studied NLP tasks: https://arxiv.org/abs/2508.17536
- RAND provides structured expert-elicitation guidance: https://www.rand.org/pubs/tools/TLA3082-1.html

These establish documented integration paths and research candidates, not tested compatibility with this organization's accounts or proof of effectiveness for specification review. Thorough council-protocol research and local integration validation remain outstanding.

Compare single-agent review, independent multi-agent review, bounded moderated debate, and structured iterative review on representative software and discovery briefs. Assess useful findings, unsupported claims, preserved dissent, specification completeness, human acceptance, latency, and resource usage. Do not choose a protocol solely because it produces agreement.

## Delivery sequence

An interactive interface concept was created on 2026-10-26 covering authentication, dashboard, marketplace, agent/skill/trait configuration, GROW setup, context assignments, parallel briefing, live/offline launch, invitations, structured chat, mentions, quote replies, transcription preview, and revision approval. Connected services and agent responses in that concept are explicitly simulated; it is not a running backend implementation.

1. Inspect existing Marvin configuration files, YAML schema, valid output example, and Delphi API JSON. Establish compatibility requirements.
2. Validate locally: GitHub OAuth -> Copilot response, model discovery, concurrent isolated specialist sessions, streaming/cancellation, owner identity, and restart/resume behavior. Validate role-specific Delphi searches and citation rendering. Evaluate a transcription path.
3. Define domain/API contracts and build the marketplace, agent builder, GROW brief, council workspace, document review, voice-input interaction, and approval UI against clearly simulated data.
4. Implement a minimal end-to-end council with persistence, bounded execution, cited context, document revisions, human feedback, and quorum approval.
5. Add schema validation and export of Markdown plus the Marvin YAML plan. Demonstrate resume without losing context or resetting the budget.
6. Evaluate council protocols on representative cases, then harden and choose hosting.

Frontend prototyping can proceed while integration details are resolved. A schema-compliant plan cannot be promised until the actual schema has been supplied and validated.

## Required inputs and remaining decisions

- Existing Marvin YAML schema and preferably one valid example plan.
- Delphi API JSON, without live credentials in documents or chat.
- Existing Marvin agent/trait/skill files or repository location, if available.
- Reviewer eligibility, effect of an explicit rejection, and approval invalidation rules.
- Whether the stated typical four agents includes the moderator.
- Default token allowance, extension authority, and feasibility of strict per-call enforcement through the SDK.
- Internal cost allocation policy and whether reporting alone is sufficient; splitting costs is currently a possibility, not a confirmed requirement.
- Transcription languages, provider constraints, and audio handling expectations.
- Figma preview availability through Delphi.
- Local OAuth app configuration and organizational enablement; credentials belong in local secret configuration.
- Final theme, frontend/backend language choices, hosting, and delivery date.

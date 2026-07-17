# workspace ai

A full-stack ChatGPT-style application with distinct consumer Chat and professional Work surfaces.

## architecture

- Next.js 16 + React 19 application shell
- normalized libSQL/Turso persistence for workspaces, projects, threads, messages, activities, agents, artifacts, settings, encrypted credentials, and usage events
- local SQLite fallback (`workspace.db`) for development and Docker; Turso for serverless deployment
- encrypted server-side provider and connector credentials using AES-256-GCM
- OpenAI, Anthropic, OpenRouter, and Alibaba/OpenAI-compatible model adapters
- authenticated GitHub, Gmail, Google Calendar, Google Drive, Figma, and configurable finances connector tools
- NDJSON event streaming for text deltas, activities, agent runs, artifacts, citations, connector calls, failures, and usage
- enforced 8-hour and weekly included quotas with pay-as-you-go overage accounting

## product behavior

### Chat mode

- consumer-oriented conversation surface
- automatic/default model selection hidden from the main UX
- recent-chat sidebar without project or agent clutter
- suggestions generated from an index of prior chat titles and user topics
- softer visual treatment and compact controls

### Work mode

- projects, pinned workspaces, connector skills, model selection, effort, and speed controls
- multi-agent research → implementation → adversarial QC → lead synthesis
- private subagent end-of-work reports linked to parent turns
- artifacts and detailed runtime events in the right inspector
- every visible activity is a single monochrome line; selecting it opens its detailed record

## UI details

- viewport-safe upload/plugin menu with bounded scrolling
- responsive settings layout that uses the full modal width
- accent palette propagated to switches, progress bars, focus rings, selected controls, and primary actions
- explicit Pin/Unpin model actions
- attachment spacing and mobile safe-area handling
- edge-swipe sidebar opening, sidebar dismissal, and inspector dismissal on touch devices

## run

```bash
cp .env.example .env.local
npm ci
npm run dev
```

The schema is created automatically on first request.

## environment

```bash
# model providers; users can alternatively connect encrypted credentials in Settings
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OPENROUTER_API_KEY=
DASHSCOPE_API_KEY=

# optional web search
TAVILY_API_KEY=

# persistent database: omit for local workspace.db
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=

# REQUIRED in production for credential encryption
APP_ENCRYPTION_KEY=

APP_URL=http://localhost:3000
```

## connectors

The settings UI accepts server-encrypted access tokens. Live tools are registered only for connected integrations:

- GitHub: repository search and file reads
- Gmail: message search and metadata retrieval
- Google Calendar: event search across a time range
- Google Drive: file search
- Figma: file-tree and component metadata reads
- Finances: typed queries against a configured authenticated connector endpoint

For a public multi-user SaaS launch, replace manual token entry with the OAuth authorization-code flow for each vendor and attach the workspace cookie to your authentication principal. The connector execution layer and encrypted credential store are already separated for that swap.

## deploy

### Vercel / serverless

Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, and `APP_ENCRYPTION_KEY`; then deploy with standard Next.js settings.

### Docker

```bash
docker build -t workspace-ai .
docker run --rm -p 3000:3000 \
  -v workspace-ai-data:/app/data \
  -e TURSO_DATABASE_URL=file:/app/data/workspace.db \
  --env-file .env.local workspace-ai
```

Health check: `GET /api/health`.

## validation

```bash
npm run typecheck
npm run build
```

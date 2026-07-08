# AGENTS Guide For TermsWatch

This file is the full handoff guide for the TermsWatch application. It is intended for maintainers, coding agents, and future contributors who need a reliable map of the current product, architecture, constraints, and validation expectations.

## Product identity

TermsWatch is a production-style policy comparison product. It is not a generic LLM toy, a static marketing mock, or a hackathon-only prototype.

The product promise is simple:

1. ingest two versions of a policy by URL or pasted text
2. extract readable content server-side
3. compare the versions at clause level
4. classify risk
5. explain impact in plain language
6. save the report in a private authenticated workspace
7. let users reopen, share, print, and export the result

## Repository structure

- `src/`: React frontend
- `server/`: Express API, auth, extraction, persistence, samples, and LLM integration
- `shared/analysis.js`: deterministic comparison engine and fallback layer
- `data/app.json`: primary persisted application state
- `data/comparisons.json`: legacy report data used for migration/bootstrap
- `auth.test.js`: auth/session/report-scoping tests
- `comparison.test.js`: deterministic analysis regression tests
- `README.md`: local setup and environment guidance

## Frontend architecture

### Files

- `src/main.jsx`: React bootstrap
- `src/App.jsx`: application shell and route-level UI
- `src/styles.css`: full design system and responsive layout rules

### Route model

The frontend is a real React single-page application, but it does not currently use `react-router`. Navigation is implemented with browser history utilities:

- `navigateTo(path)`
- `window.history.pushState`
- `window.addEventListener('popstate', ...)`
- pathname parsing via `currentReportIdFromPath()`

### Current routes

- `/`: landing page plus auth entry
- `/app`: dashboard overview
- `/app/new`: comparison workspace
- `/app/reports`: report history list
- `/app/reports/:id`: report detail
- `/app/settings`: settings/workspace details

### Core frontend components in `src/App.jsx`

- `LandingPage`
- `AppNav`
- `DashboardOverview`
- `ComparisonWorkspace`
- `ReportsPage`
- `ReportDetail`
- `SettingsPage`

### Frontend state responsibilities

`App` manages:

- auth state
- dashboard stats
- comparison form state
- samples
- report history
- active report
- filters
- loading and error states
- copy/share UI state

### Frontend product rules

- Keep the landing page descriptive and premium.
- Keep the authenticated app shell focused and operational.
- Keep the report summary and changed clauses easy to reach.
- Do not hide the core report behind tabs that make review harder.
- Keep auth, report history, and settings integrated into the same app surface.
- Mobile inputs, filters, and navigation must remain usable.

## Design system and UX direction

The current visual direction is a warm, premium compliance SaaS:

- serif-led hero typography
- rounded glass-like panels
- editorial but professional spacing
- light enterprise palette instead of generic startup defaults
- descriptive product framing instead of “AI magic” fluff

### Preserve

- premium feel
- strong typography
- visible hierarchy
- direct explanation of product value
- serious app-shell structure

### Avoid

- plain sample-page aesthetics
- hackathon/demo copy
- purple-on-white AI template styling
- turning the product into a generic chat UI
- burying important functionality behind collapses or tabs

## Backend architecture

### Files

- `server/index.js`: Express app and route definitions
- `server/auth.js`: cookie/session helpers and auth guards
- `server/extract.js`: source fetching and readable text extraction
- `server/llm.js`: deterministic analysis plus LLM enhancement orchestration
- `server/storage.js`: JSON file persistence for users, sessions, and reports
- `server/samples.js`: built-in sample policies and metadata

### Server responsibilities

The backend owns:

- URL fetching
- readable text extraction
- auth and session management
- report persistence
- history scoping
- report export
- comparison orchestration
- LLM enhancement

The browser must never fetch comparison URLs directly.

## Authentication

TermsWatch now includes local authenticated accounts.

### Current auth behavior

- signup with name, email, and password
- login with email and password
- logout and session invalidation
- `HttpOnly` session cookie
- per-user report history

### Storage behavior

- passwords are hashed with `scrypt`
- sessions are stored in `data/app.json`
- session lookup is token-hash based
- auth state is restored with `GET /api/auth/me`

### Important auth routes

- `GET /api/auth/me`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Important auth rules

- signup/login must always return JSON
- protected endpoints must stay user-scoped
- a user must never be able to read another user’s report
- do not reintroduce empty auth responses

## Persistence

### Primary data file

- `data/app.json`

### Stored collections

- `users`
- `sessions`
- `reports`

### Persistence rules

- writes should remain simple and bounded
- `saveReport()` currently keeps up to 500 reports
- session storage is bounded to 200 entries
- avoid destructive schema changes without a migration path
- keep legacy import compatibility with `data/comparisons.json`

## Comparison pipeline

### Deterministic layer

`shared/analysis.js` is the structural source of truth. It should continue to handle:

- clause discovery
- add/remove/modify structure
- baseline risk scoring
- metrics generation
- fallback report construction

### LLM layer

`server/llm.js` enhances, but does not replace, deterministic output.

It should improve:

- headline quality
- summary bullets
- why-it-matters framing
- clause-level explanation quality
- tag and risk wording

It should not:

- invent clause changes
- replace deterministic change detection
- present itself as legal advice

### Provider priority

Provider selection is:

1. OpenRouter if `OPENROUTER_API_KEY` exists
2. OpenAI if `OPENAI_API_KEY` exists
3. deterministic fallback otherwise

### Default model

- frontend default: `openrouter/free`
- backend default: `openrouter/free`

## API contract

### Public endpoints

- `GET /api/health`
- `GET /api/samples`
- `GET /api/sample/:id`
- `GET /api/auth/me`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### Protected endpoints

- `GET /api/history`
- `GET /api/report/:id`
- `GET /api/export/:id`
- `POST /api/compare`

### Required report response shape

The frontend currently depends on these keys:

- `overview`
- `metrics`
- `changes`
- `runLog`
- `sources`
- `id`

Do not break this contract without updating the frontend in the same change.

### Compare request shape

URL mode:

```json
{
  "mode": "url",
  "model": "openrouter/free",
  "previous": { "kind": "url", "value": "https://example.com/old" },
  "current": { "kind": "url", "value": "https://example.com/new" }
}
```

Text mode:

```json
{
  "mode": "text",
  "model": "openrouter/free",
  "previous": { "kind": "text", "value": "..." },
  "current": { "kind": "text", "value": "..." }
}
```

## Demo/sample behavior

The built-in sample URL pair must remain available. It is important for:

- deterministic local demos
- fast QA
- URL-mode validation
- regression testing when external sites fail

Do not remove the demo pair.

## Environment variables

Supported variables:

- `OPENROUTER_API_KEY`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_APP_NAME`
- `OPENAI_API_KEY`
- `TERMSWATCH_DATA_FILE`
- `TERMSWATCH_LEGACY_FILE`
- `NODE_ENV`

## Local runtime defaults

- API server: `http://127.0.0.1:8787`
- Vite dev server usually: `http://127.0.0.1:4173`
- Vite may move to another port such as `4174` if needed

In development, the frontend intentionally uses:

- `http://127.0.0.1:8787`

through:

- `const API_BASE = import.meta.env.DEV ? 'http://127.0.0.1:8787' : ''`

This is intentional and should not be casually removed.

## Current feature set

### Landing page

- premium hero
- product explanation
- account creation/login
- platform framing
- workflow framing
- output framing
- security/control framing

### Dashboard overview

- app sidebar
- workspace metrics
- quick actions
- recent report list

### Comparison workspace

- URL input mode
- pasted-text mode
- model field
- sample presets
- swap action
- pipeline/run-status panel

### Reports

- saved history list
- direct report route
- executive summary
- why-it-matters section
- metrics cards
- risk and change filters
- clause diff cards
- copy share link
- print action
- markdown export

### Settings

- account details
- model defaults
- workspace summary

## Product guardrails

### Must preserve

- server-side URL fetching
- deterministic fallback behavior
- private authenticated history
- report export
- OpenRouter-first provider behavior
- `openrouter/free` default model
- premium, serious product presentation

### Must not regress into

- static sample-page behavior
- unauthenticated public report reading
- client-side remote URL fetching
- legal-advice language
- brittle auth flows with empty responses
- throwaway demo copy

## Recommended future additions

- team workspaces
- collaborative collections
- stronger report search/filtering
- branded PDF export
- source citation anchors
- deeper chunking for long policies
- saved model preferences
- password reset
- email verification

## Testing expectations

### Automated

- run `npm test`
- run `npm run build`

### API validation

- validate `/api/health`
- validate auth signup/login
- validate `/api/compare` in text mode
- validate `/api/compare` in URL mode
- validate `/api/history`
- validate `/api/report/:id`
- validate `/api/export/:id`

### UI validation

- validate landing page copy and layout
- validate signup flow
- validate redirect into `/app`
- validate navigation between overview, new comparison, reports, and settings
- validate report generation after compare
- validate history reload
- validate direct report route loading when authenticated
- validate export and share controls
- validate desktop and mobile behavior

## Latest validation completed

During the latest implementation pass, the following were validated:

- `npm test`
- `npm run build`
- live browser signup
- redirect into authenticated dashboard
- navigation into comparison workspace
- in-browser text comparison
- report route opening after compare
- `GET /api/health`
- API signup
- API history
- API compare in text mode
- API compare in URL mode with demo URLs
- markdown export output

## Notes for future agents

- Read this file before making structural changes.
- Preserve the production tone of the product.
- Improve the current focused workflow before adding adjacent workflows.
- If you change auth, storage, routing, or the report response shape, update tests and this file in the same pass.

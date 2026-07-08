# TermsWatch

TermsWatch is now a full-stack app with:

- React + Vite frontend
- Express backend API
- server-side URL fetching and readable text extraction
- local account auth with session cookies and hashed passwords
- OpenAI or OpenRouter-backed comparison enhancement with deterministic fallback
- saved report history
- shareable report links
- markdown export

## Design direction

The landing page is now intentionally positioned like a production SaaS site rather than a hackathon explainer. The current UI direction is inspired by the category patterns used by [Termly](https://termly.io/), [iubenda](https://www.iubenda.com/en/), [OneTrust](https://www.onetrust.com/), and [TrustArc](https://trustarc.com/): strong enterprise headline, platform framing, concise workflow explanation, and a direct account CTA.

## Run locally

1. Create `.env` with one of these if you want live model reasoning.

OpenRouter is now the default path in TermsWatch, and the default model is `openrouter/free`:

```bash
OPENROUTER_API_KEY=...
OPENROUTER_SITE_URL=http://127.0.0.1:4173
OPENROUTER_APP_NAME=TermsWatch
```

or

```bash
OPENAI_API_KEY=...
```

2. Start the stack:

```bash
npm run api
npm run dev
```

Or run both together:

```bash
npm run dev:full
```

Then open [http://127.0.0.1:4173](http://127.0.0.1:4173).

## API routes

- `GET /api/auth/me`
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/compare`
- `GET /api/history`
- `GET /api/report/:id`
- `GET /api/export/:id`
- `GET /api/samples`

## Notes

- If `OPENAI_API_KEY` and `OPENROUTER_API_KEY` are both missing, or the model call fails, TermsWatch still works using the deterministic comparison engine.
- When both keys are present, TermsWatch now prefers `OPENROUTER_API_KEY`.
- The default model is `openrouter/free`, which uses OpenRouter’s free-model router rather than a fixed paid model slug.
- Auth is local to this app right now: users, sessions, and reports persist in `data/app.json`.
- In development, the frontend calls the API directly on `http://127.0.0.1:8787` with credentials instead of relying only on the Vite proxy path.
- Demo URLs are built in so the app remains easy to validate without depending on a third-party site.
- Live remote URL fetching depends on network access and the target site allowing fetch plus extraction.

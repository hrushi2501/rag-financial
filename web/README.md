# LedgerLens web

Next.js/React/TypeScript interface for the financial RAG service. The default flow uses task-based Celery ingestion with authenticated fetch-based SSE and polling recovery; the legacy synchronous API is available behind a feature flag.

## Setup

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Environment:

- `NEXT_PUBLIC_API_URL`: public Flask API origin; defaults to `http://localhost:5000`.
- `NEXT_PUBLIC_ASYNC_INGESTION=true`: use `/api/ingestions/upload` and durable progress.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: enable the magic-link auth gate and attach refreshed bearer tokens to Flask requests. Leave both empty only for local `AUTH_MODE=disabled` development.

## API contract

- `GET /api/docs` → `{ success, documents }`
- `POST /api/ingestions/upload` multipart `file` → `202 { success, job, taskId: job.id, workerTaskId }`
- `GET /api/ingestions/:jobId/events` → named SSE `progress` events
- `GET /api/ingestions/:jobId` → `{ success, job }` polling fallback
- `POST /api/chat` with `{ message, topK, includeContext }` → `{ success, response, citations }`
- `DELETE /api/docs/:documentId` → `{ success }`

Supported progress stages are normalized to `preparing`, `uploading`, `parsing`, `chunking`, `embedding`, `indexing`, `verifying`, `complete`, and `failed`.

Citation cards render filename, page range, section, source excerpt, chunk identity, and retrieval score when supplied.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```

# LedgerLens — Financial Document RAG

LedgerLens is a financial-document research system for 10-Ks, 10-Qs, annual reports, pitchbooks, and structured spreadsheets. It combines page-preserving extraction, financial-aware chunking, FinBERT embeddings, tenant-scoped Pinecone retrieval, Gemini answers, and traceable evidence.

The repository now contains a typed Next.js product UI, a secure Flask API, and a working local/Docker Celery ingestion path. Supabase production persistence, hybrid dense+sparse retrieval, selective OCR, and published performance metrics remain explicit next milestones; no unmeasured latency claim is made.

## What is implemented

- Next.js 16, React 19, and TypeScript workspace with upload, durable ingestion progress, document management, grounded chat, and rich citation cards.
- Optional Supabase magic-link authentication in the browser and Flask JWT verification through asymmetric JWKS, with a legacy-secret compatibility path.
- Restricted CORS, tenant-derived Pinecone namespaces, file-size/type/signature validation, safe public errors, and a disabled-by-default tenant-only vector flush.
- Fast local/Docker async upload adapter: Flask stores bytes, returns `202`, and dispatches parsing/embedding/indexing to Celery through Redis.
- PyMuPDF4LLM PDF Markdown extraction with page provenance and `pypdf` fallback.
- DOCX, XLSX, CSV, and TXT extraction.
- Token-budgeted financial chunking that respects headings, repeats table headers across row groups, preserves page metadata, and creates deterministic chunk IDs.
- Lazy, worker-cached FinBERT mean-pooled embeddings and bounded 200-vector Pinecone batches.
- Page, section, excerpt, chunk ID, and retrieval-score citations.
- Atomic, inter-process-locked JSON development repositories plus a production Supabase/Postgres schema with RLS.
- Backend/API tests, frontend lint/type/build checks, Docker Compose, and GitHub Actions.

## Architecture

```text
Next.js / React / TypeScript
        |
        +-- optional Supabase Auth
        |
        v
Flask REST API ---- durable job/status contract ----> local JSON (development)
        |                                            Supabase/Postgres (target)
        v
Redis broker ---> Celery worker
                    |
                    +-- PyMuPDF4LLM page Markdown
                    +-- financial-aware token chunking
                    +-- batched FinBERT embeddings
                    +-- tenant-scoped Pinecone indexing

Query -> FinBERT -> Pinecone -> Gemini -> page-level evidence
```

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md), and [benchmark contract](docs/BENCHMARKING.md).

## Quick start with Docker

Requirements: Docker Compose, Pinecone API key, and optionally a Gemini API key.

```bash
cp .env.example .env
# Fill PINECONE_API_KEY and GEMINI_API_KEY in .env
docker compose up --build
```

Open <http://localhost:3000>. The API is available on <http://localhost:5000>. Redis and the Celery worker are part of the default Compose stack, and asynchronous ingestion is enabled by default there.

The first worker run downloads the FinBERT model into a persistent Hugging Face cache volume.

## Local development

Backend:

```bash
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r python_backend/requirements.txt
cp .env.example .env
python -m python_backend.app
```

Worker and Redis are required for the default asynchronous UI path. You can run Redis locally and then:

```bash
celery -A python_backend.tasks:celery_app worker --loglevel=INFO --concurrency=1
```

Frontend:

```bash
cd web
npm ci
cp .env.example .env.local
npm run dev
```

Set `NEXT_PUBLIC_ASYNC_INGESTION=false` only when intentionally testing the legacy synchronous upload path.

## Authentication modes

`AUTH_MODE=disabled` is for local development only and uses the configured development tenant. It must not be used for a public deployment.

For Supabase:

1. Apply [python_backend/schema.sql](python_backend/schema.sql) to a Supabase project and configure organization membership.
2. Set `AUTH_MODE=supabase`, `SUPABASE_URL`, and the expected issuer/audience values in the backend.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the web build.
4. Use asymmetric signing keys so Flask verifies tokens through Supabase JWKS.

The current local async adapter stores objects on the shared Docker volume. Production should upload directly to a private Supabase Storage bucket with a short-lived signed URL, then create an ingestion job with a server-authorized tenant-prefixed object key.

## API

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/healthz` | Process liveness; does not initialize ML/provider clients |
| `GET` | `/readyz` | Configuration readiness summary |
| `POST` | `/api/ingestions/upload` | Local/Docker multipart async ingestion |
| `POST` | `/api/ingestions` | Create a job for an existing authorized object key |
| `GET` | `/api/ingestions/<job_id>` | Durable status lookup |
| `GET` | `/api/ingestions/<job_id>/events` | SSE progress stream |
| `POST` | `/api/upload` | Legacy synchronous ingestion compatibility path |
| `POST` | `/api/chat` | Tenant-scoped retrieval and generated answer |
| `GET` | `/api/docs` | List tenant documents |
| `DELETE` | `/api/docs/<document_id>` | Delete tenant document vectors and metadata |

## Verification

```bash
./scripts/check.sh
python -m pytest -q python_backend/tests
cd web
npm run lint
npm run typecheck
npm run build
```

CI runs source checks, backend tests, frontend checks, and both container builds.

## Performance and resume claims

The architecture is designed for 500+ page reports, but this repository deliberately publishes no ingestion or retrieval number until the benchmark harness, labeled financial QA set, and reproducible report are complete.

Before claiming “sub-400 ms retrieval” or “500+ pages in seconds,” the report must identify:

- native-text versus scanned/table-heavy cohort;
- hardware, model runtime, provider region, concurrency, and cold/warm state;
- parsing, chunking, embedding, upsert, query embedding, retrieval, reranking, and generation stages separately;
- p50/p95 latency alongside Recall@5, MRR, citation precision, and faithfulness.

Resume-safe wording for the current checked-in system:

> Built an asynchronous financial-document RAG system using Python, Flask, Celery, Redis, Next.js, TypeScript, FinBERT, Pinecone, and Gemini, with tenant-scoped retrieval and page-level evidence citations.

Add quantitative results only from a committed benchmark artifact.

## Known production gaps

- The checked-in Supabase schema is a bootstrap contract; versioned migrations, organization bootstrap, Storage policies, and a Postgres repository adapter are still required.
- Retrieval is currently dense-only; sparse retrieval, fusion, reranking, filtering, and citation validation are roadmap work.
- Native-text extraction is implemented; selective OCR is not.
- Local JSON repositories are development adapters, not the production source of truth.
- Pinecone batches are bounded but currently submitted serially; concurrency/retry tuning must follow measurement.
- The legacy synchronous endpoint should be removed after signed object uploads are deployed.

## Repository map

```text
web/                       Next.js/React/TypeScript product UI
python_backend/app.py      Flask API and ingestion contracts
python_backend/tasks.py    Celery worker entrypoint
python_backend/parser.py   Page-preserving extraction
python_backend/chunker.py  Financial-aware token chunking
python_backend/embedder.py FinBERT embedding boundary
python_backend/vector_store.py Pinecone adapter
python_backend/schema.sql  Supabase/Postgres + RLS bootstrap
python_backend/tests/      Unit and API tests
frontend/                  Legacy static UI, retained temporarily
docs/                      Architecture, roadmap, benchmark contract
```

## Author

[Hrushi Bhanvadiya](https://hrushi-bhanvadiya.vercel.app) (ઋષિ ભાણવડીયા), also known as Rushi and Hrushi2501. See the portfolio for project context and contact links.

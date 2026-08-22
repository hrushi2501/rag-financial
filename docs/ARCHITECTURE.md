# Architecture

This document distinguishes the checked-in system from the approved target architecture. A component belongs in the current section only when executable code exists in this repository.

## Checked-in system

```text
Next.js / React / TypeScript
            |
            v
Flask API: auth, uploads, jobs, SSE, chat, documents
            |
            v
Redis broker --> Celery worker
                  |-- PyMuPDF4LLM / structured extractors
                  |-- page/table-aware token chunker
                  |-- cached batched FinBERT
                  `-- tenant-scoped Pinecone
                              |
                              v
                       Gemini + rich citations
```

The default Docker path accepts upload bytes in Flask, stores them on the shared private volume, creates a durable job ID, and immediately dispatches parsing, chunking, embedding, and indexing to Celery. A legacy synchronous endpoint remains for compatibility. Querying embeds a question, searches the caller's tenant namespace, builds a grounded Gemini prompt, and returns page/section/excerpt citations.

### Current constraints

- Flask still receives the local/Docker file upload; direct signed-to-object-storage upload is the production target.
- Job and document repositories use locked atomic JSON locally; the Supabase/Postgres repository adapter is not implemented yet.
- The Supabase schema and browser/backend auth boundaries exist, but Storage policies and organization bootstrap are deployment work.
- Retrieval is dense-only. Sparse retrieval, fusion, reranking, ready-version filtering, and citation entailment checks are not implemented.
- Native-text page extraction exists; selective OCR and layout-quality routing do not.
- Pinecone writes are bounded batches but remain serial and need retry/reconciliation hardening.
- SSE is reconnectable through client polling fallback, but production fan-out should use durable Postgres state plus Redis notifications rather than long-held polling threads.

## Production completion target

```text
Next.js / React / TypeScript
       |                 |
       |                 +-- signed upload --> Supabase private Storage
       v                                           |
Flask REST API <-------------------------------- object key
       |                 |
       |                 +--> Supabase Postgres + RLS (durable state)
       v
Celery / Redis
       |
       +--> CPU parser queue: PyMuPDF4LLM + selective OCR
       +--> chunker: page/section/table-aware parent-child chunks
       +--> embedding queue: preloaded model + bounded batching
       +--> indexing queue: bounded Pinecone writes + reconciliation

Postgres job state --> Flask SSE --> resumable UI progress

Query --> dense + sparse retrieval --> fusion --> reranker
      --> adjacent context --> Gemini --> citation validation
```

## Target boundaries

| Component | Responsibility | Must not own |
| --- | --- | --- |
| Next.js | UI, direct signed upload, progress and chat presentation | Service-role credentials or vector authorization |
| Flask API | Authentication verification, authorization, validation, job/query API | Long-running parsing or embedding |
| Supabase Postgres | Durable job/document/chunk metadata, audit trail, evaluations | Embedding vectors |
| Supabase Storage | Immutable versioned source objects | Public unauthenticated document URLs |
| Redis | Celery broker and short-lived event transport | Sole durable job state |
| Celery workers | Idempotent stage execution and progress | User authorization decisions |
| Pinecone | Tenant-isolated retrieval index | Canonical document state |
| Gemini | Grounded answer synthesis | Treating retrieved document instructions as trusted |

## Identity and idempotency

Use stable identifiers across every store:

- `organization_id`: authorization and Pinecone namespace boundary.
- `document_id`: logical document visible to the user.
- `document_version_id`: immutable uploaded object and checksum.
- `chunk_id`: deterministic ID derived from version, location, ordinal, and chunker version.
- `ingestion_job_id`: one observable attempt with stage timings and failure data.
- `vector_id`: equal to or deterministically derived from `chunk_id`.

An ingestion is complete only after Postgres chunk records and Pinecone vectors reconcile. Retries overwrite deterministic IDs instead of creating duplicates.

## Queue and concurrency model

Do not nest an unrestricted process pool inside every prefork Celery worker. Assign explicit resource budgets:

- Parsing queue: CPU-bound workers with per-container CPU and memory limits.
- OCR queue: isolated, low-concurrency workers for scanned pages.
- Embedding queue: one long-lived model instance per GPU, or a separate inference endpoint.
- Indexing queue: I/O concurrency bounded by provider limits, with jittered exponential backoff.

Backpressure is required between stages. Each task emits counts, durations, and a checkpoint and can resume from its last committed stage.

## Security model

Before public deployment:

1. Verify Supabase JWTs in Flask and derive tenant identity from the token, never request JSON.
2. Use Postgres RLS and private storage buckets.
3. Validate extension, MIME type, magic bytes, size, page count, encryption, and decompression limits.
4. Accept signed object keys rather than arbitrary filesystem paths.
5. Restrict CORS and apply per-user and per-organization rate limits.
6. Remove the HTTP vector-flush route; destructive administration belongs in an authenticated operator command.
7. Return stable public error codes while keeping provider details in structured logs.
8. Treat retrieved document content as untrusted data and test document prompt injection.

## Observability contract

Every request and task carries `request_id`, `ingestion_job_id`, `organization_id`, and `document_version_id` where applicable. Metrics cover stage duration and throughput, queue depth and retries, resource utilization, query-stage latency, retrieval quality, citation validation, and vector reconciliation.

Logs must not contain document bodies, sensitive prompts, access tokens, or provider keys.

## Deployment evolution

Compose now builds the Next.js web app, Flask API, Redis, and Celery worker. Production completion replaces local-volume uploads and JSON repositories with private Supabase Storage and Postgres repositories, applies versioned migrations, and deploys the services behind TLS with external secret management and observability.

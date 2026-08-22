# Production Master Plan

The goal is a secure, observable, reproducibly benchmarked financial-document RAG system. Speed is one axis; provenance, retrieval quality, and failure recovery matter equally.

## Progress snapshot

- Delivered foundation: restricted API/auth boundary, tenant namespaces, safe upload validation, liveness/readiness, tests and CI.
- Delivered local/Docker async vertical slice: Next.js upload, durable job ID, Celery/Redis processing, authenticated fetch-based SSE with polling recovery, document catalog update.
- Delivered extraction/chunking baseline: page-preserving PyMuPDF4LLM, structured format parsers, table-row-aware token budgets, deterministic page citations.
- Delivered product surface: Next.js/React/TypeScript document library, progress UI, grounded chat, citations, and optional Supabase magic-link gate.
- Remaining production work: Postgres repository adapter/migrations, signed Storage upload, hybrid retrieval/reranking, selective OCR, reconciliation/retry hardening, evaluation corpus, observability, and measured release report.

## Definition of done

A tenant can upload a 500+ page report without occupying an API worker, observe and resume ingestion, query it with page-level citations, and reproduce published quality and latency numbers from a versioned benchmark configuration.

## Phase 0 — Stabilize and secure

Deliverables:

- Fix browser runtime errors and align accepted formats across UI and API.
- Restrict CORS, validate uploads, sanitize public errors, and add request IDs.
- Delete or strongly authenticate the global Pinecone flush route.
- Separate liveness and readiness checks.
- Add unit tests around extraction, chunking, validation, and destructive operations.
- Add lint, type, test, secret, dependency, and image checks to CI.

Exit: local flow has no browser errors, anonymous callers cannot perform global destructive operations, CI gates changes, and documentation is truthful.

## Phase 1 — Durable asynchronous ingestion

Deliverables:

- Add Supabase Auth, private Storage, Postgres schema, migrations, and RLS tests.
- Upload directly through short-lived signed URLs.
- Create jobs through Flask using storage object keys, not client filesystem paths.
- Add Redis and Celery with separate API and worker processes.
- Persist transitions in Postgres and use Redis only for transport/live events.
- Add reconnectable SSE, cancellation, timeouts, retries, idempotency, and operator handling.

Exit: job creation returns `202` quickly, refresh does not lose progress, worker termination is recoverable, and repeat ingestion creates no duplicate vectors.

## Phase 2 — Provenance-preserving extraction

Deliverables:

- Use PyMuPDF4LLM for native-text PDFs and preserve per-page Markdown.
- Extract headings, tables, pages, source bounds, and warnings.
- Detect insufficient native text and route only those pages to OCR.
- Store source checksum, parser version/configuration, and page output.
- Add fixtures for narrative, table-heavy, multi-column, encrypted, and scanned PDFs.

Exit: every retrieved unit maps to immutable page evidence, financial tables remain intelligible, page failures are retryable, and a 550+ page fixture stays within resource limits. No speed threshold is assumed.

## Phase 3 — Financial-aware chunking

Deliverables:

- Replace character windows with embedding-tokenizer-aware limits.
- Segment by page, section, paragraph, and table boundaries.
- Preserve table rows and repeat necessary title/header context.
- Retain raw source separately from compact retrieval context.
- Link small retrieval children to larger parent and adjacent context.
- Version configuration and deterministic IDs.

Compare the current baseline, heading-aware chunks, page/section/table-aware chunks, and parent-child retrieval. Exit only when chunks respect model limits and the selected strategy improves labeled retrieval metrics.

## Phase 4 — Embedding and indexing throughput

Deliverables:

- Keep one model loaded per inference worker and batch by token budget.
- Benchmark FinBERT PyTorch before ONNX, reduced precision, quantization, TensorRT, or an inference server.
- Compare FinBERT with a model trained explicitly for retrieval.
- Use deterministic vector IDs, bounded concurrent batches, retry/backoff, checkpoints, and reconciliation.

Exit: profiling identifies the real bottleneck, acceleration preserves retrieval quality within a declared tolerance, and interrupted indexing resumes without a false completed state.

## Phase 5 — Retrieval and grounded answers

Deliverables:

- Add a retriever interface and document/ticker/report/period filters.
- Combine dense and lexical/sparse candidates and benchmark fusion.
- Rerank a bounded candidate set and expand parent/adjacent context.
- Add thresholds and an insufficient-evidence response.
- Return page, section, excerpt, immutable chunk ID, and score per citation.
- Validate numerical claims and test document prompt injection.

Exit: exact and conceptual questions beat the dense-only baseline, unsupported questions abstain at an evaluated rate, and numerical answers have source evidence.

## Phase 6 — Evaluation and benchmarks

Deliverables:

- Version a public 5–10 document manifest with hashes, cohorts, and at least one verified 500+ page report.
- Create 100–200 reviewed questions with expected pages/chunks.
- Measure Recall@1/5, MRR@10, nDCG@10, citation precision/recall, faithfulness, and abstention.
- Measure ingestion and query stages, peak resources, throughput, retries, and failures.
- Commit machine-readable reports and environment/configuration manifests.

Exit: another developer can reproduce results; every resume number maps to a report field and clean commit.

## Phase 7 — Product and operations finish

Deliverables:

- Replace the static UI with Next.js, React, and TypeScript.
- Add accessible progress, recovery, document browsing, chat, and source-page viewing.
- Add Docker services/images for API, workers, Redis, and web.
- Add staging/production CI/CD, migrations, evaluation gates, scanning, and rollback.
- Add logs, traces, dashboards, alerts, runbooks, backups, deletion, and retention.
- Publish a demo, architecture narrative, benchmark report, trade-offs, and limitations.

Exit: end-to-end tests cover upload through citation and cross-tenant denial, and deployments are reproducible and reversible.

## Resume evidence produced

| Area | Evidence |
| --- | --- |
| Python / OOP | Typed parser, chunker, embedder, retriever, and store interfaces |
| DSA / DAA | Token packing, rank fusion, batching/backpressure, measured comparisons |
| DBMS / SQL / Supabase | Schema, constraints, transactions, indexes, migrations, RLS |
| Networks | REST, signed uploads, SSE reconnect, timeouts, retries, rate limits |
| Operating systems | Process/queue model, resource limits, signals, graceful shutdown |
| AI / ML / NLP | Embedding experiments, retrieval metrics, reranking, grounded generation |
| Computer vision | Selective OCR/layout only after scanned-document fixtures exist |
| React / Next.js / TypeScript | Authenticated UI and typed API contracts |
| SDLC / CI/CD / QA | Layered tests, review gates, migrations, benchmark gates, rollback |

XGBoost, RLHF, MongoDB, Express, C, C++, and Java should not be inserted merely to match a skills list. Add one only when it solves a measured problem.

## Decision gates

- Do not optimize FinBERT until profiling shows embedding inference is material.
- Do not OCR all pages; detect and route low-text pages.
- Do not use ticker as a tenant namespace.
- Do not publish a latency target as a result.
- Do not mark ingestion complete until metadata and vectors reconcile.
- Do not call chunking semantic until its structure and quality gain are implemented and measured.

# Benchmarking Contract

The project does not currently publish measured ingestion or retrieval performance. This document defines the evidence required before adding metrics to the README, portfolio, or resume.

## Rules

1. Report distributions and percentiles, not one favorable run.
2. Separate pipeline stages.
3. Record corpus, code, configuration, hardware, provider region, and concurrency.
4. Gate performance improvements on retrieval and citation quality.
5. Separate native-text, scanned, and table-heavy cohorts.
6. Retain machine-readable samples or auditable histograms.

## Corpus manifest

Use public or redistributable documents. Commit metadata and checksum/download instructions rather than copyrighted files when necessary.

```json
{
  "document_id": "public-stable-id",
  "title": "Example FY2025 Form 10-K",
  "source_url": "https://...",
  "sha256": "...",
  "document_type": "10-K",
  "page_count": 0,
  "cohort": "native-text|table-heavy|scanned|mixed",
  "bytes": 0,
  "license_note": "Public filing; source link retained"
}
```

The main set should contain 5–10 reports and at least one independently verified 500+ page document. Never infer page count from file size.

## Evaluation set

Create 100–200 reviewed questions covering exact values, period/segment comparisons, risks, accounting terminology, table context, and unanswerable questions. Each needs expected document version, pages, evidence excerpt, answerability, and reviewer status. Split tuning and final sets before choosing chunking, fusion, thresholds, or reranker settings.

Report Recall@1/5, MRR@10, nDCG@10, citation precision/recall, numerical-claim support, faithfulness, correct abstention, and false abstention.

## Ingestion measurement

Instrument non-overlapping spans for object download, validation, native parse, selective OCR, chunking, embedding, vector upsert, reconciliation, and total wall time.

For every run record document hash/page count/bytes/cohort/chunk count, worker allocation and peak RSS/VRAM, parser/model/precision/batch/chunker versions, Pinecone region/index/write concurrency, cold/warm/cache state, concurrent jobs, retries, and failures. Report p50/p90/p95/p99 and sample count where meaningful.

“Uploaded in seconds” is ambiguous. API acceptance latency and background completion latency are separate metrics.

## Retrieval measurement

Measure query preprocessing, query embedding, dense search, sparse search, fusion, reranking, context expansion, and total retrieval wall time separately. LLM generation is excluded from retrieval latency and reported as time to first token and complete response.

Warm up before samples, use a fixed query set at declared concurrency, and record client-to-provider network time and provider regions.

## Experiment matrix

| Experiment | Baseline | Candidate | Quality gate |
| --- | --- | --- | --- |
| Parsing | `pypdf` | PyMuPDF4LLM | Page/evidence and table preservation |
| Chunking | Character windows | Section/table-aware | Recall@5 and citation accuracy |
| Embedding runtime | Batched PyTorch | ONNX/quantized/server | Retrieval regression within tolerance |
| Retrieval | Dense only | Dense + sparse + fusion | nDCG/MRR and exact-term subset |
| Ranking | Vector score | Reranker | Quality gain versus p95 cost |
| Upsert | Single request | Bounded concurrency | Exact reconciliation, no orphans |

## Machine-readable report

```json
{
  "schema_version": 1,
  "generated_at": "RFC3339 timestamp",
  "git_commit": "full commit SHA",
  "dirty_worktree": false,
  "corpus_manifest_sha256": "...",
  "evaluation_set_sha256": "...",
  "environment": {
    "cpu": "...",
    "memory_gib": 0,
    "gpu": "none|...",
    "os": "...",
    "python": "...",
    "provider_regions": {"pinecone": "...", "llm": "..."}
  },
  "configuration": {
    "parser": "...",
    "chunker_version": "...",
    "embedding_model": "...",
    "embedding_runtime": "...",
    "batch_size_or_token_budget": 0,
    "retriever": "...",
    "reranker": "none|..."
  },
  "ingestion": {},
  "retrieval_latency": {},
  "retrieval_quality": {},
  "answer_quality": {},
  "failures": []
}
```

Store generated, versioned outputs under `benchmarks/results/` when a runner exists. Never hand-edit a generated report.

## Resume release gate

A metric may be used externally only when it comes from a clean commit and frozen set, identifies its percentile/sample count/concurrency/stage boundary, passes quality thresholds, is reproducible from repository instructions, and can be linked to a report or commit during an interview.

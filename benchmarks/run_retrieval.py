#!/usr/bin/env python3
"""Measure retrieval latency and labeled page recall against a frozen JSONL set."""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    weight = position - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def relevant(metadata: dict, expected: list[dict]) -> bool:
    document_id = metadata.get("document_id")
    page_start = metadata.get("page_start")
    page_end = metadata.get("page_end", page_start)
    for target in expected:
        if target.get("document_id") != document_id:
            continue
        pages = target.get("pages") or []
        if not pages or page_start is None:
            return True
        if any(int(page_start) <= int(page) <= int(page_end) for page in pages):
            return True
    return False


def git_value(*args: str) -> str:
    return subprocess.check_output(["git", *args], text=True).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--questions", type=Path, required=True)
    parser.add_argument("--tenant", required=True)
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--warmup", type=int, default=5)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    questions = [json.loads(line) for line in args.questions.read_text(encoding="utf-8").splitlines() if line.strip()]
    if not questions:
        raise SystemExit("question set is empty")

    from python_backend.service import RAGService

    service = RAGService()
    for item in questions[: min(args.warmup, len(questions))]:
        service.search(item["question"], args.top_k, tenant_id=args.tenant)

    latencies = []
    reciprocal_ranks = []
    hits_at_1 = hits_at_5 = hits_at_k = 0
    samples = []
    for item in questions:
        started = time.perf_counter()
        results = service.search(item["question"], args.top_k, tenant_id=args.tenant)
        elapsed_ms = (time.perf_counter() - started) * 1000
        latencies.append(elapsed_ms)
        rank = next((index for index, result in enumerate(results, start=1) if relevant(result.metadata, item["expected"])), None)
        reciprocal_ranks.append(1 / rank if rank else 0.0)
        hits_at_1 += int(rank == 1)
        hits_at_5 += int(rank is not None and rank <= 5)
        hits_at_k += int(rank is not None and rank <= args.top_k)
        samples.append({"id": item.get("id"), "latency_ms": round(elapsed_ms, 3), "first_relevant_rank": rank})

    count = len(questions)
    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "git_commit": git_value("rev-parse", "HEAD"),
        "dirty_worktree": bool(git_value("status", "--porcelain")),
        "question_set": str(args.questions),
        "sample_count": count,
        "top_k": args.top_k,
        "latency_boundary": "query embedding plus Pinecone dense search; excludes generation",
        "environment": {"python": sys.version, "platform": platform.platform()},
        "retrieval_latency_ms": {
            "mean": round(statistics.fmean(latencies), 3),
            "p50": round(percentile(latencies, 0.50), 3),
            "p95": round(percentile(latencies, 0.95), 3),
            "max": round(max(latencies), 3),
        },
        "retrieval_quality": {
            "recall_at_1": hits_at_1 / count,
            "recall_at_5": hits_at_5 / count,
            f"recall_at_{args.top_k}": hits_at_k / count,
            f"mrr_at_{args.top_k}": statistics.fmean(reciprocal_ranks),
        },
        "samples": samples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), **report["retrieval_latency_ms"], **report["retrieval_quality"]}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

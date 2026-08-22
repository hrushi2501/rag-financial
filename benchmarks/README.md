# Retrieval benchmark

Create a reviewed JSONL question set using `questions.example.jsonl` as the schema. Each expected item identifies an indexed document and one or more acceptable evidence pages.

```bash
python -m benchmarks.run_retrieval \
  --questions benchmarks/questions.v1.jsonl \
  --tenant benchmark-tenant \
  --top-k 10 \
  --output benchmarks/results/retrieval-v1.json
```

The runner warms the model/index, measures query-embedding plus Pinecone search latency, and reports Recall@1/5/K and MRR@K. It intentionally excludes Gemini generation. Do not use the example row as evidence or publish results from a dirty worktree.

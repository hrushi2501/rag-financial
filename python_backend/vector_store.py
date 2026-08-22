"""Vector-store boundary and bounded batched Pinecone implementation."""

from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any, Protocol

try:
    from .models import FinancialChunk
except ImportError:  # pragma: no cover
    from models import FinancialChunk


@dataclass(frozen=True)
class VectorMatch:
    id: str
    score: float
    metadata: dict[str, Any]


class VectorStore(Protocol):
    def upsert(self, chunks: list[FinancialChunk], vectors: list[list[float]], namespace: str) -> int: ...
    def query(self, vector: list[float], top_k: int, namespace: str, filters: dict | None = None) -> list[VectorMatch]: ...
    def delete_document(self, document_id: str, namespace: str) -> None: ...
    def ready(self) -> bool: ...


class PineconeVectorStore:
    def __init__(
        self,
        api_key: str | None,
        index_name: str,
        dimension: int = 768,
        cloud: str = "aws",
        region: str = "us-east-1",
        metric: str = "cosine",
        batch_size: int = 200,
    ):
        self.api_key = api_key
        self.index_name = index_name
        self.dimension = dimension
        self.cloud = cloud
        self.region = region
        self.metric = metric
        self.batch_size = batch_size
        self.client = None
        self.index = None

    def connect(self) -> None:
        if self.index is not None:
            return
        if not self.api_key:
            raise RuntimeError("Pinecone is not configured")
        from pinecone import Pinecone, ServerlessSpec

        self.client = Pinecone(api_key=self.api_key)
        indexes = self.client.list_indexes().names()
        if self.index_name not in indexes:
            self.client.create_index(
                name=self.index_name,
                dimension=self.dimension,
                metric=self.metric,
                spec=ServerlessSpec(cloud=self.cloud, region=self.region),
            )
        self.index = self.client.Index(self.index_name)

    def upsert(self, chunks: list[FinancialChunk], vectors: list[list[float]], namespace: str) -> int:
        if len(chunks) != len(vectors):
            raise ValueError("chunk/vector count mismatch")
        self.connect()
        records = []
        for chunk, vector in zip(chunks, vectors):
            records.append(
                {
                    "id": chunk.chunk_id,
                    "values": vector,
                    "metadata": {
                        **chunk.metadata,
                        "text": chunk.text,
                        "source_text": chunk.source_text,
                        "page_start": chunk.page_start,
                        "page_end": chunk.page_end,
                        "section": chunk.section or "",
                        "token_count": chunk.token_count,
                    },
                }
            )
        for start in range(0, len(records), self.batch_size):
            batch = records[start : start + self.batch_size]
            for attempt in range(3):
                try:
                    self.index.upsert(vectors=batch, namespace=namespace)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(0.5 * (2 ** attempt))
        return len(records)

    def query(
        self, vector: list[float], top_k: int, namespace: str, filters: dict | None = None
    ) -> list[VectorMatch]:
        self.connect()
        response = self.index.query(
            vector=vector,
            top_k=top_k,
            namespace=namespace,
            filter=filters,
            include_metadata=True,
        )
        raw_matches = response.get("matches", []) if isinstance(response, dict) else response.matches
        return [
            VectorMatch(
                id=match.get("id", "") if isinstance(match, dict) else match.id,
                score=float(match.get("score", 0) if isinstance(match, dict) else match.score),
                metadata=dict(match.get("metadata", {}) if isinstance(match, dict) else match.metadata),
            )
            for match in raw_matches
        ]

    def delete_document(self, document_id: str, namespace: str) -> None:
        self.connect()
        self.index.delete(filter={"document_id": {"$eq": document_id}}, namespace=namespace)

    def ready(self) -> bool:
        if not self.api_key:
            return False
        try:
            self.connect()
            self.index.describe_index_stats()
            return True
        except Exception:
            return False

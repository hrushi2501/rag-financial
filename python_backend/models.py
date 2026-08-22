"""Dependency-free domain models shared by HTTP, workers, and repositories."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JobStatus(str, Enum):
    QUEUED = "queued"
    VALIDATING = "validating"
    PARSING = "parsing"
    CHUNKING = "chunking"
    EMBEDDING = "embedding"
    INDEXING = "indexing"
    VERIFYING = "verifying"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass(frozen=True)
class PageContent:
    page_number: int
    text: str
    tables: tuple[str, ...] = ()
    source_type: str = "native_text"


@dataclass(frozen=True)
class FinancialChunk:
    chunk_id: str
    text: str
    source_text: str
    page_start: int
    page_end: int
    section: str | None
    token_count: int
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class IngestionJob:
    id: str
    tenant_id: str
    storage_key: str
    filename: str
    status: JobStatus = JobStatus.QUEUED
    progress: int = 0
    stage: str = "Queued"
    document_id: str | None = None
    total_pages: int = 0
    total_chunks: int = 0
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=utc_now)
    updated_at: str = field(default_factory=utc_now)

    @classmethod
    def create(
        cls, tenant_id: str, storage_key: str, filename: str, metadata: dict[str, Any] | None = None
    ) -> "IngestionJob":
        return cls(
            id=f"job_{uuid4().hex}",
            tenant_id=tenant_id,
            storage_key=storage_key,
            filename=filename,
            metadata=metadata or {},
        )

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["status"] = self.status.value
        return data

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "IngestionJob":
        values = dict(data)
        values["status"] = JobStatus(values.get("status", JobStatus.QUEUED.value))
        return cls(**values)


@dataclass(frozen=True)
class Citation:
    document_id: str | None
    filename: str | None
    chunk_id: str | None
    chunk_index: int | None
    page_start: int | None
    page_end: int | None
    section: str | None
    excerpt: str
    retrieval_score: float

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

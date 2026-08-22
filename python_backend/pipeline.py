"""Worker-side ingestion orchestration with explicit, durable stages."""

from __future__ import annotations

import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

try:
    from .chunker import FinancialChunker
    from .embedder import Embedder
    from .models import JobStatus
    from .parser import FinancialDocumentParser
    from .repositories import IngestionJobRepository
    from .vector_store import VectorStore
except ImportError:  # pragma: no cover
    from chunker import FinancialChunker
    from embedder import Embedder
    from models import JobStatus
    from parser import FinancialDocumentParser
    from repositories import IngestionJobRepository
    from vector_store import VectorStore


class IngestionPipeline:
    def __init__(
        self,
        jobs: IngestionJobRepository,
        parser: FinancialDocumentParser,
        chunker: FinancialChunker,
        embedder: Embedder,
        vector_store: VectorStore,
        storage_root: str | Path,
        documents_path: str | Path | None = None,
    ):
        self.jobs = jobs
        self.parser = parser
        self.chunker = chunker
        self.embedder = embedder
        self.vector_store = vector_store
        self.storage_root = Path(storage_root).resolve()
        self.documents_path = Path(documents_path) if documents_path else None

    @contextmanager
    def _catalog_lock(self):
        if self.documents_path is None:
            yield
            return
        lock_path = self.documents_path.with_suffix(self.documents_path.suffix + ".lock")
        with lock_path.open("a+") as lock_file:
            try:
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            except ImportError:  # pragma: no cover
                pass
            try:
                yield
            finally:
                try:
                    import fcntl

                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                except ImportError:  # pragma: no cover
                    pass

    def _record_document(self, job, document_id: str, total_pages: int, total_chunks: int) -> None:
        """Update the credential-free local catalog after vector verification."""
        if self.documents_path is None:
            return
        self.documents_path.parent.mkdir(parents=True, exist_ok=True)
        with self._catalog_lock():
            records = {}
            if self.documents_path.exists() and self.documents_path.stat().st_size:
                try:
                    records = json.loads(self.documents_path.read_text(encoding="utf-8"))
                except (json.JSONDecodeError, OSError):
                    records = {}
            records[document_id] = {
                "document_id": document_id,
                "filename": job.filename,
                "file_type": Path(job.filename).suffix.lstrip(".").lower(),
                "total_chunks": total_chunks,
                "total_pages": total_pages,
                "upload_date": datetime.now(timezone.utc).isoformat(),
                "size_bytes": int(job.metadata.get("size_bytes", 0)),
                "tenant_id": job.tenant_id,
            }
            temporary = self.documents_path.with_suffix(self.documents_path.suffix + f".{os.getpid()}.tmp")
            temporary.write_text(json.dumps(records, indent=2), encoding="utf-8")
            os.replace(temporary, self.documents_path)

    def _resolve_local_object(self, storage_key: str) -> Path:
        candidate = (self.storage_root / storage_key).resolve()
        if self.storage_root not in candidate.parents:
            raise ValueError("invalid storage key")
        if not candidate.is_file():
            raise FileNotFoundError("stored document was not found")
        return candidate

    def run(self, job_id: str) -> dict:
        job = self.jobs.get(job_id)
        if not job:
            raise KeyError(job_id)
        document_id = job.document_id
        try:
            self.jobs.update(job_id, status=JobStatus.VALIDATING, progress=5, stage="Validating document")
            path = self._resolve_local_object(job.storage_key)
            document_id = job.document_id or f"doc_{uuid4().hex}"

            self.jobs.update(
                job_id, status=JobStatus.PARSING, progress=10, stage="Extracting pages", document_id=document_id
            )
            pages = self.parser.parse_path(path, job.filename)

            self.jobs.update(
                job_id,
                status=JobStatus.CHUNKING,
                progress=40,
                stage="Building financial chunks",
                total_pages=len(pages),
            )
            chunks = self.chunker.chunk(pages, document_id, job.filename, job.metadata)
            if not chunks:
                raise ValueError("document produced no searchable chunks")

            self.jobs.update(
                job_id,
                status=JobStatus.EMBEDDING,
                progress=55,
                stage="Generating embeddings",
                total_chunks=len(chunks),
            )
            vectors = self.embedder.embed([chunk.text for chunk in chunks])

            self.jobs.update(job_id, status=JobStatus.INDEXING, progress=80, stage="Indexing vectors")
            indexed = self.vector_store.upsert(chunks, vectors, namespace=job.tenant_id)
            if indexed != len(chunks):
                raise RuntimeError("vector verification failed")

            self._record_document(job, document_id, len(pages), indexed)

            completed = self.jobs.update(
                job_id, status=JobStatus.COMPLETED, progress=100, stage="Complete", total_chunks=indexed
            )
            return completed.to_dict()
        except Exception as exc:
            if document_id:
                try:
                    self.vector_store.delete_document(document_id, namespace=job.tenant_id)
                except Exception:
                    # The failed job remains durable so reconciliation can retry
                    # cleanup without hiding the original ingestion error.
                    pass
            self.jobs.update(
                job_id,
                status=JobStatus.FAILED,
                stage="Failed",
                error_code=type(exc).__name__,
                error_message=str(exc)[:500],
            )
            raise

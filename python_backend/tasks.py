"""Celery application and task entrypoints.

Importing this module does not contact Redis, Pinecone, or model registries.
Dependencies are constructed only when a worker executes a task.
"""

from __future__ import annotations

try:
    from . import config
except ImportError:  # pragma: no cover
    import config

try:
    from celery import Celery
except ImportError:  # pragma: no cover - clear error is returned by dispatch
    Celery = None


celery_app = None
if Celery is not None:
    celery_app = Celery("financial_rag", broker=config.CELERY_BROKER_URL, backend=config.CELERY_RESULT_BACKEND)
    celery_app.conf.update(
        task_track_started=True,
        task_acks_late=True,
        worker_prefetch_multiplier=1,
        task_always_eager=config.CELERY_TASK_ALWAYS_EAGER,
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        result_expires=3600,
        broker_connection_retry_on_startup=True,
        task_soft_time_limit=1800,
        task_time_limit=2100,
        broker_transport_options={"visibility_timeout": 2400},
    )


def build_pipeline():
    try:
        from .chunker import FinancialChunker
        from .embedder import FinBERTEmbedder
        from .parser import FinancialDocumentParser
        from .pipeline import IngestionPipeline
        from .repositories import JsonIngestionJobRepository
        from .vector_store import PineconeVectorStore
    except ImportError:  # pragma: no cover - supports ``celery -A tasks``
        from chunker import FinancialChunker
        from embedder import FinBERTEmbedder
        from parser import FinancialDocumentParser
        from pipeline import IngestionPipeline
        from repositories import JsonIngestionJobRepository
        from vector_store import PineconeVectorStore

    return IngestionPipeline(
        jobs=JsonIngestionJobRepository(config.JOBS_FILE),
        parser=FinancialDocumentParser(
            config.MIN_PDF_TEXT_LENGTH,
            config.MAX_DOCUMENT_PAGES,
            config.MAX_ARCHIVE_UNCOMPRESSED_SIZE,
        ),
        chunker=FinancialChunker(max_tokens=min(config.CHUNK_SIZE, 400), overlap_tokens=min(config.CHUNK_OVERLAP, 40)),
        embedder=FinBERTEmbedder(config.EMBEDDING_MODEL_NAME, config.EMBEDDING_DIMENSION),
        vector_store=PineconeVectorStore(
            config.PINECONE_API_KEY,
            config.PINECONE_INDEX_NAME,
            config.EMBEDDING_DIMENSION,
            config.PINECONE_CLOUD,
            config.PINECONE_REGION,
            config.PINECONE_METRIC,
        ),
        storage_root=config.INGESTION_STORAGE_DIR,
        documents_path=config.INDEX_FILE,
    )


_worker_pipeline = None


def get_worker_pipeline():
    """Keep the tokenizer/model warm for the lifetime of a worker process."""
    global _worker_pipeline
    if _worker_pipeline is None:
        _worker_pipeline = build_pipeline()
    return _worker_pipeline


if celery_app is not None:
    @celery_app.task(bind=True, autoretry_for=(ConnectionError,), retry_backoff=True, retry_kwargs={"max_retries": 3})
    def ingest_document(self, job_id: str):
        return get_worker_pipeline().run(job_id)
else:
    ingest_document = None


def dispatch_ingestion(job_id: str) -> str:
    if not config.ASYNC_INGESTION_ENABLED:
        raise RuntimeError("Async ingestion is disabled")
    if ingest_document is None:
        raise RuntimeError("Celery is not installed")
    result = ingest_document.delay(job_id)
    return result.id

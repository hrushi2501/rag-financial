from pathlib import Path

from python_backend.chunker import FinancialChunker
from python_backend.models import IngestionJob, JobStatus, PageContent
from python_backend.parser import FinancialDocumentParser
from python_backend.pipeline import IngestionPipeline
from python_backend.repositories import JsonIngestionJobRepository


class FakeEmbedder:
    dimension = 2

    def embed(self, texts):
        return [[1.0, 0.0] for _ in texts]


class FakeVectorStore:
    def __init__(self):
        self.records = []

    def upsert(self, chunks, vectors, namespace):
        self.records.extend((chunk, vector, namespace) for chunk, vector in zip(chunks, vectors))
        return len(chunks)


def test_chunker_preserves_page_provenance_and_table():
    text = "# Income Statement\n\nRevenue grew.\n\n| Metric | FY24 |\n|---|---|\n| Revenue | $45.2M |"
    chunks = FinancialChunker(max_tokens=50, overlap_tokens=5).chunk(
        [PageContent(17, text)], "doc_1", "report.pdf", {"ticker": "ACME"}
    )
    assert chunks
    assert all(chunk.page_start == 17 and chunk.page_end == 17 for chunk in chunks)
    assert any("| Revenue | $45.2M |" in chunk.source_text for chunk in chunks)
    assert all("ACME" in chunk.text for chunk in chunks)


def test_chunker_enforces_embedding_budget_for_long_text_and_tables():
    chunker = FinancialChunker(max_tokens=50, overlap_tokens=5)
    prose = "word " * 600
    table = "| Metric | Value |\n|---|---|\n" + "\n".join(
        f"| revenue row {index} | value {index} |" for index in range(180)
    )
    chunks = chunker.chunk([PageContent(1, prose + "\n\n" + table)], "doc_limit", "report.pdf")
    assert chunks
    assert max(chunk.token_count for chunk in chunks) <= 50
    assert any("| Metric | Value |" in chunk.source_text for chunk in chunks)


def test_parser_rejects_spoofed_office_archive():
    parser = FinancialDocumentParser()
    try:
        parser.parse_bytes("report.docx", b"PK\x03\x04not-a-real-office-file")
    except ValueError as error:
        assert "ZIP" in str(error)
    else:
        raise AssertionError("invalid Office archive was accepted")


def test_repository_enforces_tenant_filter(tmp_path):
    repository = JsonIngestionJobRepository(tmp_path / "jobs.json")
    job = repository.create(IngestionJob.create("tenant-a", "report.txt", "report.txt"))
    assert repository.get(job.id, "tenant-a") is not None
    assert repository.get(job.id, "tenant-b") is None
    updated = repository.update(job.id, status=JobStatus.PARSING, progress=10)
    assert updated.status is JobStatus.PARSING


def test_pipeline_transitions_to_completed(tmp_path):
    storage = tmp_path / "storage"
    storage.mkdir()
    (storage / "report.txt").write_text("Revenue was $45.2 million.\n\nNet income was $9 million.")
    repository = JsonIngestionJobRepository(tmp_path / "jobs.json")
    job = repository.create(IngestionJob.create("tenant-a", "report.txt", "report.txt"))
    vector_store = FakeVectorStore()
    catalog = tmp_path / "docs.json"
    pipeline = IngestionPipeline(
        repository,
        FinancialDocumentParser(),
        FinancialChunker(max_tokens=50, overlap_tokens=5),
        FakeEmbedder(),
        vector_store,
        storage,
        catalog,
    )
    result = pipeline.run(job.id)
    assert result["status"] == "completed"
    assert result["progress"] == 100
    assert vector_store.records[0][2] == "tenant-a"
    assert '"tenant_id": "tenant-a"' in catalog.read_text()


def test_pipeline_rejects_storage_traversal(tmp_path):
    storage = tmp_path / "storage"
    storage.mkdir()
    repository = JsonIngestionJobRepository(tmp_path / "jobs.json")
    job = repository.create(IngestionJob.create("tenant-a", "../secret.txt", "secret.txt"))
    pipeline = IngestionPipeline(
        repository, FinancialDocumentParser(), FinancialChunker(), FakeEmbedder(), FakeVectorStore(), storage
    )
    try:
        pipeline.run(job.id)
    except ValueError:
        pass
    else:
        raise AssertionError("storage traversal was accepted")
    assert repository.get(job.id).status is JobStatus.FAILED

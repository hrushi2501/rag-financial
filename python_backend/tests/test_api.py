import io

import pytest

flask = pytest.importorskip("flask")

from python_backend.app import create_app


class FakeRAG:
    index = None

    def add_document(self, filename, content, tenant_id):
        return {"document_id": "doc_test", "filename": filename, "total_chunks": 2}

    def answer(self, query, top_k, include_context, tenant_id):
        return "answer", [{"page_start": 4, "excerpt": "evidence"}]

    def list_documents(self, tenant_id):
        return []

    def delete_document(self, document_id, tenant_id):
        return False


@pytest.fixture()
def client(tmp_path):
    app = create_app({
        "TESTING": True,
        "RAG_SERVICE": FakeRAG(),
        "JOBS_FILE": str(tmp_path / "jobs.json"),
        "AUTH_MODE": "disabled",
    })
    return app.test_client()


def test_health_does_not_initialize_rag(client):
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.get_json()["status"] == "healthy"


def test_chat_validates_contract(client):
    assert client.post("/api/chat", json={}).status_code == 400
    response = client.post("/api/chat", json={"message": "Revenue?", "topK": 5})
    assert response.status_code == 200
    assert response.get_json()["citations"][0]["page_start"] == 4


def test_upload_rejects_spoofed_pdf(client):
    response = client.post(
        "/api/upload",
        data={"file": (io.BytesIO(b"not a pdf"), "report.pdf")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert response.get_json()["success"] is False


def test_async_contract_is_explicitly_unavailable(client):
    response = client.post("/api/ingestions", json={"storageKey": "report.pdf", "filename": "report.pdf"})
    assert response.status_code == 503
    assert response.get_json()["code"] == "async_ingestion_unavailable"


def test_async_upload_uses_durable_job_id(tmp_path, monkeypatch):
    storage = tmp_path / "uploads"
    app = create_app({
        "TESTING": True,
        "RAG_SERVICE": FakeRAG(),
        "JOBS_FILE": str(tmp_path / "jobs.json"),
        "INGESTION_STORAGE_DIR": str(storage),
        "AUTH_MODE": "disabled",
        "ASYNC_INGESTION_ENABLED": True,
    })
    monkeypatch.setattr("python_backend.tasks.dispatch_ingestion", lambda job_id: "celery-worker-id")
    local_client = app.test_client()
    response = local_client.post(
        "/api/ingestions/upload",
        data={"file": (io.BytesIO(b"Revenue was $45 million."), "report.txt")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 202
    payload = response.get_json()
    assert payload["taskId"].startswith("job_")
    assert payload["workerTaskId"] == "celery-worker-id"
    status = local_client.get(f"/api/ingestions/{payload['taskId']}")
    assert status.status_code == 200
    assert status.get_json()["job"]["filename"] == "report.txt"
    assert next(storage.rglob("*.txt")).read_bytes() == b"Revenue was $45 million."

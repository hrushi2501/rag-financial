"""Flask application factory and secure API contracts."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from threading import Lock
from uuid import uuid4

from flask import Flask, Response, current_app, g, jsonify, request
from flask_cors import CORS
from werkzeug.utils import secure_filename

try:
    from . import config as defaults
    from .auth import require_admin, require_auth
    from .models import IngestionJob, JobStatus
    from .repositories import JsonIngestionJobRepository
except ImportError:  # pragma: no cover - supports ``python app.py``
    import config as defaults
    from auth import require_admin, require_auth
    from models import IngestionJob, JobStatus
    from repositories import JsonIngestionJobRepository


class LazyServiceProvider:
    """Construct model/vector clients only on the first real RAG request."""

    def __init__(self, factory):
        self.factory = factory
        self.instance = None
        self._lock = Lock()

    def get(self):
        if self.instance is None:
            with self._lock:
                if self.instance is None:
                    self.instance = self.factory()
        return self.instance


def _service_factory():
    try:
        from .service import RAGService
    except ImportError:  # pragma: no cover
        from service import RAGService
    return RAGService()


def _allowed_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in current_app.config["SUPPORTED_EXTENSIONS"]


def _valid_signature(filename: str, content: bytes) -> bool:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return content.startswith(b"%PDF-")
    if suffix in {".docx", ".xlsx"}:
        return content.startswith(b"PK\x03\x04")
    return True


def _error(message: str, status: int, code: str):
    return jsonify({
        "success": False,
        "error": message,
        "code": code,
        "requestId": getattr(g, "request_id", None),
    }), status


def _safe_document_metadata(value: object) -> dict:
    if not isinstance(value, dict):
        return {}
    allowed = {"ticker", "report_name", "report_type", "fiscal_period", "fiscal_year"}
    cleaned = {}
    for key in allowed:
        item = value.get(key)
        if isinstance(item, (str, int, float)):
            cleaned[key] = str(item).strip()[:240]
    return cleaned


def create_app(test_config: dict | None = None) -> Flask:
    frontend = os.path.abspath(os.path.join(os.path.dirname(__file__), "../frontend"))
    app = Flask(__name__, static_folder=frontend, static_url_path="/")
    app.config.from_mapping(
        MAX_CONTENT_LENGTH=defaults.MAX_FILE_SIZE * defaults.MAX_FILES_PER_REQUEST,
        MAX_FILE_SIZE=defaults.MAX_FILE_SIZE,
        MAX_FILES_PER_REQUEST=defaults.MAX_FILES_PER_REQUEST,
        MAX_QUERY_LENGTH=defaults.MAX_QUERY_LENGTH,
        SUPPORTED_EXTENSIONS=defaults.SUPPORTED_EXTENSIONS,
        ALLOWED_ORIGINS=defaults.ALLOWED_ORIGINS,
        AUTH_MODE=defaults.AUTH_MODE,
        SUPABASE_JWT_SECRET=defaults.SUPABASE_JWT_SECRET,
        SUPABASE_JWT_AUDIENCE=defaults.SUPABASE_JWT_AUDIENCE,
        SUPABASE_JWKS_URL=defaults.SUPABASE_JWKS_URL,
        SUPABASE_JWT_ISSUER=defaults.SUPABASE_JWT_ISSUER,
        DEV_USER_ID=defaults.DEV_USER_ID,
        DEV_TENANT_ID=defaults.DEV_TENANT_ID,
        ENABLE_ADMIN_FLUSH=defaults.ENABLE_ADMIN_FLUSH,
        ASYNC_INGESTION_ENABLED=defaults.ASYNC_INGESTION_ENABLED,
        JOBS_FILE=defaults.JOBS_FILE,
        INGESTION_STORAGE_DIR=defaults.INGESTION_STORAGE_DIR,
        RAG_SERVICE=None,
        JOB_REPOSITORY=None,
    )
    if test_config:
        app.config.update(test_config)

    CORS(
        app,
        resources={r"/api/*": {"origins": app.config["ALLOWED_ORIGINS"]}},
        supports_credentials=app.config["AUTH_MODE"] != "disabled",
    )
    injected_service = app.config.get("RAG_SERVICE")
    app.extensions["rag_provider"] = LazyServiceProvider(lambda: injected_service or _service_factory())
    app.extensions["job_repository"] = app.config.get("JOB_REPOSITORY") or JsonIngestionJobRepository(
        app.config["JOBS_FILE"]
    )

    @app.before_request
    def assign_request_id():
        candidate = request.headers.get("X-Request-ID", "")
        g.request_id = candidate[:100] if candidate and candidate.replace("-", "").isalnum() else uuid4().hex

    @app.after_request
    def attach_request_id(response):
        response.headers["X-Request-ID"] = g.request_id
        return response

    _register_routes(app)
    _register_errors(app)
    return app


def _register_routes(app: Flask) -> None:
    def rag():
        return current_app.extensions["rag_provider"].get()

    def dispatch_job(job: IngestionJob):
        repository = current_app.extensions["job_repository"]
        repository.create(job)
        try:
            try:
                from .tasks import dispatch_ingestion
            except ImportError:  # pragma: no cover
                from tasks import dispatch_ingestion
            worker_task_id = dispatch_ingestion(job.id)
        except Exception:
            current_app.logger.exception("Could not dispatch ingestion")
            repository.update(
                job.id,
                status=JobStatus.FAILED,
                stage="Dispatch failed",
                error_code="dispatch_unavailable",
                error_message="Background worker is unavailable",
            )
            return None, _error("Background worker is unavailable", 503, "worker_unavailable")

        persisted = repository.get(job.id, job.tenant_id) or job
        response = jsonify({
            "success": True,
            "job": persisted.to_dict(),
            "taskId": job.id,
            "workerTaskId": worker_task_id,
        })
        response.status_code = 202
        response.headers["Location"] = f"/api/ingestions/{job.id}"
        return response, None

    @app.get("/healthz")
    @app.get("/api/health")
    def health():
        return jsonify({"status": "healthy", "service": "financial-rag-api"})

    @app.get("/readyz")
    def readiness():
        provider = current_app.extensions["rag_provider"]
        details = {
            "rag_initialized": provider.instance is not None,
            "pinecone_configured": bool(defaults.PINECONE_API_KEY),
            "gemini_configured": bool(defaults.GEMINI_API_KEY),
            "async_ingestion_enabled": current_app.config["ASYNC_INGESTION_ENABLED"],
        }
        ready = details["pinecone_configured"]
        return jsonify({"status": "ready" if ready else "not_ready", "details": details}), 200 if ready else 503

    @app.post("/api/upload")
    @require_auth
    def upload():
        files = request.files.getlist("files") if "files" in request.files else [request.files.get("file")]
        files = [item for item in files if item is not None]
        if not files:
            return _error("No files uploaded", 400, "missing_file")
        if len(files) > current_app.config["MAX_FILES_PER_REQUEST"]:
            return _error("Too many files", 400, "file_limit_exceeded")

        results = []
        for uploaded in files:
            filename = secure_filename(uploaded.filename or "")
            if not filename or not _allowed_file(filename):
                results.append({"success": False, "filename": filename, "error": "Unsupported file type"})
                continue
            content = uploaded.read(current_app.config["MAX_FILE_SIZE"] + 1)
            if len(content) > current_app.config["MAX_FILE_SIZE"]:
                results.append({"success": False, "filename": filename, "error": "File is too large"})
                continue
            if not _valid_signature(filename, content):
                results.append({"success": False, "filename": filename, "error": "File content does not match extension"})
                continue
            started = time.perf_counter()
            try:
                info = rag().add_document(filename, content, tenant_id=g.principal.tenant_id)
                results.append({
                    "success": True,
                    "document": {
                        "document_id": info.get("document_id"),
                        "filename": info.get("filename"),
                        "chunksProcessed": info.get("total_chunks", 0),
                        "processingTimeMs": round((time.perf_counter() - started) * 1000, 2),
                    },
                })
            except ValueError as exc:
                results.append({"success": False, "filename": filename, "error": str(exc)})
            except Exception:
                current_app.logger.exception("Document ingestion failed")
                results.append({"success": False, "filename": filename, "error": "Document processing failed"})
        if len(results) == 1:
            return jsonify(results[0]), 200 if results[0]["success"] else 400
        return jsonify({"success": all(item["success"] for item in results), "results": results}), 200

    @app.post("/api/ingestions")
    @require_auth
    def create_ingestion():
        if not current_app.config["ASYNC_INGESTION_ENABLED"]:
            return _error("Async ingestion is not configured", 503, "async_ingestion_unavailable")
        data = request.get_json(silent=True) or {}
        storage_key = str(data.get("storageKey") or "").strip()
        filename = secure_filename(str(data.get("filename") or Path(storage_key).name))
        metadata = _safe_document_metadata(data.get("metadata"))
        if not storage_key or not filename or not _allowed_file(filename):
            return _error("A valid storageKey and filename are required", 400, "invalid_ingestion_request")
        tenant_segment = "".join(ch for ch in g.principal.tenant_id if ch.isalnum() or ch in "-_")[:80]
        if not tenant_segment or Path(storage_key).parts[:1] != (tenant_segment,):
            return _error("The storage object is not owned by this tenant", 403, "forbidden_storage_key")
        job = IngestionJob.create(g.principal.tenant_id, storage_key, filename, metadata)
        response, error = dispatch_job(job)
        return error or response

    @app.post("/api/ingestions/upload")
    @require_auth
    def upload_for_ingestion():
        """Store an upload locally, then dispatch the non-blocking pipeline.

        This is the Docker/development adapter. Production uses a short-lived
        signed object-storage upload and then calls ``POST /api/ingestions``.
        """
        if not current_app.config["ASYNC_INGESTION_ENABLED"]:
            return _error("Async ingestion is not configured", 503, "async_ingestion_unavailable")
        uploaded = request.files.get("file")
        filename = secure_filename(uploaded.filename or "") if uploaded else ""
        if not uploaded or not filename or not _allowed_file(filename):
            return _error("A supported file is required", 400, "invalid_file")

        tenant_segment = "".join(ch for ch in g.principal.tenant_id if ch.isalnum() or ch in "-_")[:80]
        if not tenant_segment:
            return _error("Invalid tenant identity", 400, "invalid_tenant")
        relative_key = f"{tenant_segment}/{uuid4().hex}-{filename}"
        destination = (Path(current_app.config["INGESTION_STORAGE_DIR"]) / relative_key).resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        maximum = current_app.config["MAX_FILE_SIZE"]
        total = 0
        signature = b""
        try:
            with destination.open("xb") as target:
                while True:
                    block = uploaded.stream.read(1024 * 1024)
                    if not block:
                        break
                    if not signature:
                        signature = block[:8]
                    total += len(block)
                    if total > maximum:
                        raise ValueError("File is too large")
                    target.write(block)
            if not _valid_signature(filename, signature):
                raise ValueError("File content does not match extension")
        except (OSError, ValueError) as exc:
            destination.unlink(missing_ok=True)
            return _error(str(exc), 400, "invalid_file")

        job = IngestionJob.create(
            g.principal.tenant_id,
            relative_key,
            filename,
            {"size_bytes": total, "upload_mode": "local_async"},
        )
        response, error = dispatch_job(job)
        if error:
            destination.unlink(missing_ok=True)
            return error
        return response

    @app.get("/api/ingestions/<job_id>")
    @require_auth
    def get_ingestion(job_id: str):
        job = current_app.extensions["job_repository"].get(job_id, g.principal.tenant_id)
        if not job:
            return _error("Ingestion job not found", 404, "not_found")
        return jsonify({"success": True, "job": job.to_dict()})

    @app.get("/api/ingestions/<job_id>/events")
    @require_auth
    def ingestion_events(job_id: str):
        repository = current_app.extensions["job_repository"]
        if not repository.get(job_id, g.principal.tenant_id):
            return _error("Ingestion job not found", 404, "not_found")
        tenant_id = g.principal.tenant_id

        def stream():
            previous = None
            for tick in range(900):
                job = repository.get(job_id, tenant_id)
                if not job:
                    return
                payload = json.dumps({
                    "stage": job.stage,
                    "percent": job.progress,
                    "status": job.status.value,
                    "error": job.error_message,
                })
                if payload != previous:
                    yield f"event: progress\ndata: {payload}\n\n"
                    previous = payload
                elif tick % 15 == 0:
                    yield ": keep-alive\n\n"
                if job.status in {JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED}:
                    return
                time.sleep(1)

        return Response(stream(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    @app.post("/api/chat")
    @require_auth
    def chat():
        data = request.get_json(silent=True) or {}
        message = str(data.get("message") or "").strip()
        try:
            top_k = int(data.get("topK", 5))
        except (TypeError, ValueError):
            return _error("topK must be an integer", 400, "invalid_top_k")
        if not message:
            return _error("message is required", 400, "missing_message")
        if len(message) > current_app.config["MAX_QUERY_LENGTH"]:
            return _error("Message is too long", 400, "query_limit_exceeded")
        if not 1 <= top_k <= 20:
            return _error("topK must be between 1 and 20", 400, "invalid_top_k")
        try:
            answer, citations = rag().answer(message, top_k, bool(data.get("includeContext", True)), tenant_id=g.principal.tenant_id)
            return jsonify({"success": True, "response": answer, "citations": citations})
        except Exception:
            current_app.logger.exception("Chat request failed")
            return _error("Chat request failed", 500, "chat_failed")

    @app.get("/api/docs")
    @require_auth
    def documents():
        return jsonify({"success": True, "documents": rag().list_documents(tenant_id=g.principal.tenant_id)})

    @app.delete("/api/docs/<document_id>")
    @require_auth
    def delete_document(document_id: str):
        if len(document_id) > 100 or not document_id.startswith("doc_"):
            return _error("Invalid document ID", 400, "invalid_document_id")
        if not rag().delete_document(document_id, tenant_id=g.principal.tenant_id):
            return _error("Document not found", 404, "not_found")
        return jsonify({"success": True})

    @app.post("/api/admin/flush-pinecone")
    @require_admin
    def flush_pinecone():
        if not current_app.config["ENABLE_ADMIN_FLUSH"]:
            return _error("Administrative flush is disabled", 404, "not_found")
        service = rag()
        if not service.index:
            return _error("Vector store is unavailable", 503, "vector_store_unavailable")
        service.index.delete(delete_all=True, namespace=g.principal.tenant_id)
        return jsonify({"success": True, "message": "Tenant vectors deleted"})

    @app.get("/")
    def index_root():
        return jsonify({
            "service": "financial-rag-api",
            "status": "healthy",
            "documentation": "/healthz",
            "web": "http://localhost:3000",
        })


def _register_errors(app: Flask) -> None:
    @app.errorhandler(413)
    def too_large(_exception):
        return _error("Request body is too large", 413, "request_too_large")

    @app.errorhandler(404)
    def not_found(exception):
        if request.path.startswith("/api/"):
            return _error("Endpoint not found", 404, "not_found")
        return exception


app = create_app()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=defaults.PORT, debug=defaults.DEBUG_MODE)

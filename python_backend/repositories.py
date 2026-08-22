"""Repository boundaries with a safe local implementation for development.

Production deployments should implement the same protocol using the Supabase
``ingestion_jobs`` table defined in ``schema.sql``.
"""

from __future__ import annotations

import json
import os
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Protocol

try:
    from .models import IngestionJob, JobStatus, utc_now
except ImportError:  # pragma: no cover - direct script compatibility
    from models import IngestionJob, JobStatus, utc_now


class IngestionJobRepository(Protocol):
    def create(self, job: IngestionJob) -> IngestionJob: ...
    def get(self, job_id: str, tenant_id: str | None = None) -> IngestionJob | None: ...
    def update(self, job_id: str, **changes: object) -> IngestionJob: ...


class JsonIngestionJobRepository:
    """Small, atomic repository for credential-free local development.

    It is deliberately not presented as a production database. A process lock
    prevents corruption within one API/worker process and ``os.replace`` makes
    writes atomic. Postgres is the production source of truth.
    """

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()

    @contextmanager
    def _process_lock(self):
        """Coordinate local JSON access across Flask and Celery processes."""
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        with lock_path.open("a+") as lock_file:
            try:
                import fcntl

                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            except ImportError:  # pragma: no cover - Windows local fallback
                pass
            try:
                yield
            finally:
                try:
                    import fcntl

                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)
                except ImportError:  # pragma: no cover
                    pass

    def _read(self) -> dict[str, dict]:
        if not self.path.exists() or self.path.stat().st_size == 0:
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}

    def _write(self, jobs: dict[str, dict]) -> None:
        temporary = self.path.with_suffix(self.path.suffix + f".{os.getpid()}.{threading.get_ident()}.tmp")
        temporary.write_text(json.dumps(jobs, indent=2), encoding="utf-8")
        os.replace(temporary, self.path)

    def create(self, job: IngestionJob) -> IngestionJob:
        with self._lock:
            with self._process_lock():
                jobs = self._read()
                if job.id in jobs:
                    raise ValueError("ingestion job already exists")
                jobs[job.id] = job.to_dict()
                self._write(jobs)
        return job

    def get(self, job_id: str, tenant_id: str | None = None) -> IngestionJob | None:
        with self._lock:
            with self._process_lock():
                raw = self._read().get(job_id)
        if not raw:
            return None
        job = IngestionJob.from_dict(raw)
        if tenant_id is not None and job.tenant_id != tenant_id:
            return None
        return job

    def update(self, job_id: str, **changes: object) -> IngestionJob:
        with self._lock:
            with self._process_lock():
                jobs = self._read()
                if job_id not in jobs:
                    raise KeyError(job_id)
                raw = dict(jobs[job_id])
                if "status" in changes and isinstance(changes["status"], JobStatus):
                    changes["status"] = changes["status"].value
                raw.update(changes)
                raw["updated_at"] = utc_now()
                job = IngestionJob.from_dict(raw)
                jobs[job_id] = job.to_dict()
                self._write(jobs)
        return job

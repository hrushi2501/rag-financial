# syntax=docker/dockerfile:1.7
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HF_HOME=/var/cache/huggingface \
    PORT=5000

WORKDIR /app
RUN addgroup --system app && adduser --system --ingroup app app

COPY python_backend/requirements.txt /tmp/requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install -r /tmp/requirements.txt \
    && python -m pip install gunicorn==23.0.0

COPY --chown=app:app python_backend /app/python_backend

RUN mkdir -p /app/python_backend/data /var/cache/huggingface \
    && chown -R app:app /app/python_backend/data /var/cache/huggingface

USER app
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '5000') + '/api/health', timeout=5)" || exit 1

WORKDIR /app/python_backend
CMD ["sh", "-c", "exec gunicorn --bind 0.0.0.0:${PORT:-5000} --worker-class gthread --workers 1 --threads 16 --timeout 300 app:app"]

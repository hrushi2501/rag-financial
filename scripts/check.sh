#!/usr/bin/env sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

if command -v python3 >/dev/null 2>&1; then
  python_bin=python3
else
  python_bin=python
fi

"$python_bin" -m compileall -q python_backend

"$python_bin" - <<'PY'
from pathlib import Path

required = (
    ".env.example",
    ".dockerignore",
    "Dockerfile",
    "Dockerfile.web",
    "compose.yaml",
    "docs/ARCHITECTURE.md",
    "docs/BENCHMARKING.md",
    "docs/ROADMAP.md",
)
missing = [path for path in required if not Path(path).is_file()]
if missing:
    raise SystemExit("missing required project files: " + ", ".join(missing))

env_text = Path(".env.example").read_text(encoding="utf-8")
for secret in ("PINECONE_API_KEY", "GEMINI_API_KEY"):
    if f"{secret}=" not in env_text:
        raise SystemExit(f".env.example does not document {secret}")

readme = Path("README.md").read_text(encoding="utf-8").lower()
for unsupported_claim in ("production-ready", "sub-400ms", "sub-30-second"):
    if unsupported_claim in readme:
        raise SystemExit(f"README contains unverified claim: {unsupported_claim}")
PY

if command -v docker >/dev/null 2>&1; then
  docker compose -f compose.yaml config --quiet
fi

echo "Repository checks passed."

# Financial RAG Chatbot (Flask + Pinecone + Gemini)

A production-ready Retrieval-Augmented Generation (RAG) chatbot for financial documents. Built with Python (Flask), Pinecone for vector storage, and Google Gemini for intelligent Q&A. Uses FinBERT embeddings (768-dim) with enforced index dimension, robust error handling, and an intuitive web UI.

---

## 🎯 Features

- Multi-format ingestion: Upload PDF, DOCX, TXT, and CSV
- Pinecone integration: Serverless vector storage (AWS us-east-1) with enforced 768-dim index
- Domain-tuned embeddings: FinBERT sentence embeddings (`ProsusAI/finbert`, 768-dim)
- Context-aware chat: Gemini extracts financial figures with citations
- Document management: List, upload, and delete documents via web UI and API
- Health monitoring: `/api/health` exposes index stats, embedding dimension, and service status

---

## 🚀 Quick Start (Windows PowerShell)

### 1. Environment Setup

```powershell
cd project/financial-rag-chatbot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r python_backend\requirements.txt
```

### 2. Configure API Keys

Create a `.env` file in `project/financial-rag-chatbot/python_backend/` (copy from `.env.example`):

```bash
# Required: Pinecone
PINECONE_API_KEY=your_pinecone_api_key_here

# Required: Google Gemini (for intelligent answers)
GEMINI_API_KEY=your_gemini_api_key_here

# Optional: Override defaults
PINECONE_INDEX_NAME=financial-rag        # Default: financial-rag
PINECONE_REGION=us-east-1               # Default: us-east-1
PORT=5000                               # Default: 5000
```

### 3. Run the Server

```powershell
pwsh .\start.ps1
```

Open <http://localhost:5000> in your browser.

---

## 📁 Project Structure

```text
financial-rag-chatbot/
├─ frontend/                     # Static web UI (HTML/CSS/JS)
│  ├─ index.html                 # Main page
│  ├─ js/                        # Frontend scripts
│  └─ css/                       # Styles
│
├─ python_backend/
│  ├─ app.py                     # Flask API + static hosting
│  ├─ service.py                 # 🎯 RAG service (ACTIVE)
│  ├─ requirements.txt           # Python dependencies
│  ├─ ARCHITECTURE.md            # Deep-dive into modules and flow
│  ├─ QUICK_REFERENCE.md         # One-page operator cheat sheet
│  ├─ .env.example               # Configuration template
│  └─ data/
│     └─ docs.json               # Local document index (metadata)
│
├─ start.ps1                     # Server launcher
└─ .gitignore                    # Ignore secrets and build artifacts
```

---

## 🔌 API Reference

### Health Check

```http
GET /api/health
```

**Response:**

```json
{
  "status": "healthy",
  "vector_store": true,
  "llm": true,
  "pinecone_total_vectors": 2544,
  "embed_dim": 768,
  "index_name": "financial-rag",
  "embedding_model": "ProsusAI/finbert",
  "vector_db": "pinecone",
  "llm_provider": "gemini"
}
```

### Upload Documents

```http
POST /api/upload
Content-Type: multipart/form-data

file: [binary]
```

**Response:**

```json
{
  "success": true,
  "document": {
    "document_id": "doc_abc123...",
    "filename": "report.pdf",
    "chunksProcessed": 569,
    "processingTime": "4523 ms"
  }
}
```

### List Documents

```http
GET /api/docs
```

**Response:**

```json
{
  "success": true,
  "documents": [
    {
      "document_id": "doc_abc123...",
      "filename": "report.pdf",
      "file_type": "pdf",
      "total_chunks": 569,
      "pinecone_vectors": 2544,
      "in_index": true,
      "upload_date": "2025-06-12T14:30:00.000Z"
    }
  ]
}
```

### Chat with Context

```http
POST /api/chat
Content-Type: application/json

{
  "message": "What is total revenue for FY2024?",
  "topK": 5,
  "includeContext": true
}
```

**Response:**

```json
{
  "success": true,
  "response": "Total revenue for FY2024 is 53,312 million CHF.",
  "citations": [
    {
      "filename": "2024-financial-statements-en.pdf",
      "document_id": "doc_7cd1...",
      "chunk_index": 512
    }
  ]
}
```

---

## 🛠️ Troubleshooting

- "Vector dimension 384 does not match the dimension of the index 768"
  - Fixed by enforcing 768-dim FinBERT and validating the Pinecone index.
- "Failed to extract text from PDF"
  - Scanned/image-only PDFs aren’t supported (no OCR). Convert to text-based PDF/DOCX.
- "Failed to load documents — Network error or CORS blocked"
  - Ensure server is running on http://localhost:5000. CORS is enabled for /api/*.

---

## 🎯 Known Limitations

1. Pinecone Serverless metadata-filtered stats
   - Per-document vector counts may not be available; totals are shown as a fallback.
2. LLM required for intelligent answers
   - Without a Gemini key, you’ll get a context snippet and a rule-based fallback where possible.
3. No OCR
   - Images/scanned PDFs are not processed.

---

## 📚 Tech Stack

- Backend: Python 3.10+, Flask 3.x, python-dotenv
- Vector store: Pinecone Serverless (AWS us-east-1, 768-dim, cosine metric)
- Embeddings: FinBERT-based sentence embeddings (`ProsusAI/finbert`, 768-dim)
- LLM: Google Gemini (`gemini-2.5-flash` preferred, fallback options supported)
- Frontend: Vanilla JavaScript, Tailwind CSS

---

## 🧹 Cleanup Notes

- Active RAG implementation: `python_backend/service.py`
- Legacy modules were removed to avoid confusion.

---

**Last updated**: October 2025 | **Status**: Production-ready

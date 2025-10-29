# Financial RAG Chatbot 💼# Financial RAG Chatbot (Flask + Pinecone + Gemini)



> An intelligent document analysis system powered by Retrieval-Augmented Generation (RAG) for financial documentsA production-ready Retrieval-Augmented Generation (RAG) chatbot for financial documents. Built with Python (Flask), Pinecone for vector storage, and Google Gemini for intelligent Q&A. Uses FinBERT embeddings (768-dim) with enforced index dimension, robust error handling, and an intuitive web UI.



A production-ready chatbot that combines vector search with large language models to provide accurate, context-aware answers from your financial documents. Built with enterprise-grade components including Pinecone vector database, FinBERT embeddings, and Google Gemini LLM.---



---## 🎯 Features



## 📖 Introduction- Multi-format ingestion: Upload PDF, DOCX, TXT, and CSV

- Pinecone integration: Serverless vector storage (AWS us-east-1) with enforced 768-dim index

### What is this?- Domain-tuned embeddings: FinBERT sentence embeddings (`ProsusAI/finbert`, 768-dim)

- Context-aware chat: Gemini extracts financial figures with citations

The Financial RAG Chatbot is an AI-powered assistant that helps you extract insights from financial documents through natural language queries. Upload your PDFs, Excel spreadsheets, Word documents, or text files, and ask questions in plain English. The system finds relevant information and generates accurate, cited answers.- Document management: List, upload, and delete documents via web UI and API

- Health monitoring: `/api/health` exposes index stats, embedding dimension, and service status

### Key Capabilities

---

- **Multi-Format Support**: Process PDF, DOCX, DOC, XLSX, XLS, CSV, and TXT files

- **Intelligent Search**: Vector similarity search using financial domain embeddings## 🚀 Quick Start (Windows PowerShell)

- **Context-Aware Answers**: AI-generated responses with source citations

- **Document Management**: Upload, browse, and delete documents through an intuitive interface### 1. Environment Setup

- **Real-Time Chat**: GPT-style conversational interface with chat history

- **Dark/Light Themes**: Minimalist UI with theme switching```powershell

cd project/financial-rag-chatbot

### Use Casespython -m venv .venv

.\.venv\Scripts\Activate.ps1

- **Financial Analysis**: Query annual reports, earnings transcripts, and financial statementspip install -r python_backend\requirements.txt

- **Due Diligence**: Extract key metrics from company documents```

- **Research**: Quickly find specific information across multiple documents

- **Compliance**: Locate regulatory disclosures and compliance data### 2. Configure API Keys

- **Auditing**: Cross-reference figures across different financial documents

Create a `.env` file in `project/financial-rag-chatbot/python_backend/` (copy from `.env.example`):

---

```bash

## 🛠 Tech Stack# Required: Pinecone

PINECONE_API_KEY=your_pinecone_api_key_here

### Backend Architecture

# Required: Google Gemini (for intelligent answers)

| Component | Technology | Purpose |GEMINI_API_KEY=your_gemini_api_key_here

|-----------|-----------|---------|

| **Web Framework** | Flask 3.0.3 | RESTful API server with CORS support |# Optional: Override defaults

| **Vector Database** | Pinecone (Serverless) | Cloud-native vector storage on AWS us-east-1 |PINECONE_INDEX_NAME=financial-rag        # Default: financial-rag

| **Embeddings** | FinBERT (ProsusAI) | 768-dimensional financial domain embeddings |PINECONE_REGION=us-east-1               # Default: us-east-1

| **LLM** | Google Gemini | Natural language generation with multi-model fallback |PORT=5000                               # Default: 5000

| **Document Processing** | pypdf, python-docx, openpyxl | Extract text from various file formats |```

| **Configuration** | python-dotenv | Environment-based configuration |

### 3. Run the Server

### Frontend Stack

```powershell

| Component | Technology | Purpose |pwsh .\start.ps1

|-----------|-----------|---------|```

| **UI Framework** | Vanilla JavaScript | Lightweight, no-dependency interface |

| **Styling** | Custom CSS + Tailwind | Minimalist design with theme system |Open <http://localhost:5000> in your browser.

| **Icons** | Font Awesome 6 | Professional iconography |

| **Storage** | LocalStorage | Client-side chat history persistence |---



### Key Dependencies## 📁 Project Structure



``````text

Flask==3.0.3              # Web serverfinancial-rag-chatbot/

pinecone>=5.0.0           # Vector database SDK├─ frontend/                     # Static web UI (HTML/CSS/JS)

sentence-transformers==3.0.1  # FinBERT embeddings│  ├─ index.html                 # Main page

google-generativeai>=0.8.3    # Gemini LLM│  ├─ js/                        # Frontend scripts

pypdf==4.3.1              # PDF text extraction│  └─ css/                       # Styles

python-docx==1.1.2        # Word document processing│

openpyxl==3.1.5           # Excel file processing├─ python_backend/

flask-cors==4.0.1         # Cross-origin resource sharing│  ├─ app.py                     # Flask API + static hosting

```│  ├─ service.py                 # 🎯 RAG service (ACTIVE)

│  ├─ requirements.txt           # Python dependencies

### System Requirements│  ├─ ARCHITECTURE.md            # Deep-dive into modules and flow

│  ├─ QUICK_REFERENCE.md         # One-page operator cheat sheet

- **Python**: 3.9 or higher│  ├─ .env.example               # Configuration template

- **Memory**: 4GB RAM minimum (8GB recommended for large documents)│  └─ data/

- **Storage**: 500MB for dependencies + document storage│     └─ docs.json               # Local document index (metadata)

- **Browser**: Modern browser with JavaScript enabled│

├─ start.ps1                     # Server launcher

---└─ .gitignore                    # Ignore secrets and build artifacts

```

## 🚀 How to Operate

---

### Initial Setup

## 🔌 API Reference

#### 1. Clone and Navigate

### Health Check

```powershell

cd project/financial-rag-chatbot```http

```GET /api/health

```

#### 2. Create Virtual Environment

**Response:**

```powershell

python -m venv .venv```json

.\.venv\Scripts\Activate.ps1{

```  "status": "healthy",

  "vector_store": true,

#### 3. Install Dependencies  "llm": true,

  "pinecone_total_vectors": 2544,

```powershell  "embed_dim": 768,

pip install -r python_backend\requirements.txt  "index_name": "financial-rag",

```  "embedding_model": "ProsusAI/finbert",

  "vector_db": "pinecone",

This installs all required packages including Flask, Pinecone, FinBERT, Gemini, and document processors.  "llm_provider": "gemini"

}

#### 4. Configure Environment```



Create `python_backend/.env` file:### Upload Documents



```bash```http

# Required: Pinecone Vector DatabasePOST /api/upload

PINECONE_API_KEY=your_pinecone_api_key_hereContent-Type: multipart/form-data



# Required: Google Gemini LLMfile: [binary]

GEMINI_API_KEY=your_gemini_api_key_here```



# Optional: Customize settings**Response:**

PINECONE_INDEX_NAME=financial-rag

PINECONE_ENVIRONMENT=us-east-1```json

PORT=5000{

CHUNK_SIZE=500  "success": true,

CHUNK_OVERLAP=50  "document": {

```    "document_id": "doc_abc123...",

    "filename": "report.pdf",

**Getting API Keys:**    "chunksProcessed": 569,

- **Pinecone**: Sign up at [pinecone.io](https://www.pinecone.io/) → Create project → Copy API key    "processingTime": "4523 ms"

- **Gemini**: Visit [ai.google.dev](https://ai.google.dev/) → Get API key  }

}

### Running the Application```



#### Start Server (PowerShell)### List Documents



```powershell```http

pwsh .\start.ps1GET /api/docs

``````



Or manually:**Response:**



```powershell```json

cd python_backend{

python app.py  "success": true,

```  "documents": [

    {

#### Access Interface      "document_id": "doc_abc123...",

      "filename": "report.pdf",

Open browser to: **http://localhost:5000**      "file_type": "pdf",

      "total_chunks": 569,

The server will:      "pinecone_vectors": 2544,

1. Load FinBERT embedding model (~400MB first time)      "in_index": true,

2. Connect to Pinecone      "upload_date": "2025-06-12T14:30:00.000Z"

3. Initialize Gemini LLM    }

4. Start Flask server on port 5000  ]

}

### Using the Interface```



#### Upload Documents### Chat with Context



1. Click **Upload** tab in header```http

2. Drag & drop files or click to browsePOST /api/chat

3. Select files: PDF, DOCX, XLSX, CSV, or TXTContent-Type: application/json

4. Files are automatically chunked and embedded

5. Monitor upload progress{

  "message": "What is total revenue for FY2024?",

#### Chat with Documents  "topK": 5,

  "includeContext": true

1. Click **Chat** tab}

2. Type your question in the input box```

3. Toggle "Include Document Context" to enable RAG

4. Select number of context chunks (3, 5, or 10)**Response:**

5. View AI-generated answer with source citations

6. Create multiple chat sessions via sidebar```json

{

#### Manage Documents  "success": true,

  "response": "Total revenue for FY2024 is 53,312 million CHF.",

1. Click **Documents** tab  "citations": [

2. View statistics: total documents, chunks, file types    {

3. Browse uploaded documents with metadata      "filename": "2024-financial-statements-en.pdf",

4. Delete documents to remove from vector database      "document_id": "doc_7cd1...",

5. Click **Refresh** to update document list      "chunk_index": 512

    }

#### Get Help  ]

}

1. Click **Help** tab```

2. View getting started guide

3. Read tips for best results---

4. Check system status indicators

5. Browse FAQs and best practices## 🛠️ Troubleshooting



### API Endpoints- "Vector dimension 384 does not match the dimension of the index 768"

  - Fixed by enforcing 768-dim FinBERT and validating the Pinecone index.

#### Health Check- "Failed to extract text from PDF"

  - Scanned/image-only PDFs aren’t supported (no OCR). Convert to text-based PDF/DOCX.

```http- "Failed to load documents — Network error or CORS blocked"

GET /api/health  - Ensure server is running on http://localhost:5000. CORS is enabled for /api/*.

```

---

Returns system status, vector count, and model info.

## 🎯 Known Limitations

#### Upload Document

1. Pinecone Serverless metadata-filtered stats

```http   - Per-document vector counts may not be available; totals are shown as a fallback.

POST /api/upload2. LLM required for intelligent answers

Content-Type: multipart/form-data   - Without a Gemini key, you’ll get a context snippet and a rule-based fallback where possible.

3. No OCR

file: <binary>   - Images/scanned PDFs are not processed.

```

---

Returns document ID and metadata.

## 📚 Tech Stack

#### Chat Query

- Backend: Python 3.10+, Flask 3.x, python-dotenv

```http- Vector store: Pinecone Serverless (AWS us-east-1, 768-dim, cosine metric)

POST /api/chat- Embeddings: FinBERT-based sentence embeddings (`ProsusAI/finbert`, 768-dim)

Content-Type: application/json- LLM: Google Gemini (`gemini-2.5-flash` preferred, fallback options supported)

- Frontend: Vanilla JavaScript, Tailwind CSS

{

  "query": "What was the revenue in Q4?",---

  "top_k": 5,

  "include_context": true## 🧹 Cleanup Notes

}

```- Active RAG implementation: `python_backend/service.py`

- Legacy modules were removed to avoid confusion.

Returns AI answer with source citations.

---

#### List Documents

**Last updated**: October 2025 | **Status**: Production-ready

```http
GET /api/docs
```

Returns array of all uploaded documents.

#### Delete Document

```http
DELETE /api/docs/<document_id>
```

Removes document and all associated vectors.

---

## 🧠 NLC Concepts and Implementation Flow

### Natural Language Comprehension (NLC) Pipeline

The system implements a complete NLC pipeline from document ingestion to answer generation:

```
Document Upload → Text Extraction → Chunking → Embedding → Vector Storage
                                                                    ↓
User Query → Query Embedding → Vector Search → Context Retrieval → LLM Generation → Answer
```

### 1. Document Processing Pipeline

#### Text Extraction

The system supports multiple file formats with specialized extractors:

**PDF Processing** (`_extract_pdf`):
- Uses pypdf library for text extraction
- Preserves document structure
- Handles multi-page documents
- Minimum length validation

**Word Processing** (`_extract_docx`):
- Extracts paragraphs from DOCX/DOC files
- Maintains paragraph breaks
- Filters empty content

**Excel Processing** (`_extract_excel`):
- Reads all sheets from XLSX/XLS files
- Converts tables to structured text
- Preserves headers and data relationships
- Formats as pipe-delimited tables

**CSV Processing** (`_extract_csv`):
- Parses comma-separated values
- Formats as readable tables
- Maintains column relationships

#### Text Chunking

Documents are split into semantic chunks for optimal retrieval:

```python
CHUNK_SIZE = 500 characters
CHUNK_OVERLAP = 50 characters
```

**Why Chunking?**
- **Better Granularity**: Retrieve specific sections, not entire documents
- **Context Fit**: Chunks fit within LLM context windows
- **Improved Relevance**: More precise similarity matching

**Algorithm**:
1. Split text at sentence boundaries
2. Group into ~500 character chunks
3. Overlap adjacent chunks by 50 characters
4. Preserve semantic continuity

### 2. Embedding Generation

#### FinBERT Model

Uses `ProsusAI/finbert` for domain-specific embeddings:

- **Architecture**: BERT fine-tuned on financial data
- **Dimensions**: 768-dimensional vectors
- **Domain**: Optimized for financial terminology
- **Vocabulary**: Understands financial metrics, ratios, and concepts

**Why FinBERT?**
- General models miss financial nuances
- Trained on earnings calls, reports, and financial news
- Better semantic understanding of terms like "EBITDA", "net margin", "ARR"

**Embedding Process**:
```python
text_chunks = ["Revenue grew 25% YoY to $50M", ...]
embeddings = model.encode(text_chunks)  # → (n, 768) array
```

### 3. Vector Storage (Pinecone)

#### Index Configuration

```python
Dimension: 768
Metric: cosine similarity
Cloud: AWS Serverless (us-east-1)
```

**Why Pinecone?**
- **Serverless**: No infrastructure management
- **Fast**: Sub-50ms queries at scale
- **Scalable**: Millions of vectors without performance degradation
- **Filtered Search**: Query with metadata filters

#### Vector Structure

Each chunk becomes a vector with metadata:

```python
{
  "id": "doc_abc123-0",
  "values": [0.123, -0.456, ...],  # 768 dimensions
  "metadata": {
    "document_id": "doc_abc123",
    "filename": "Q4_2024_Earnings.pdf",
    "chunk_index": 0,
    "total_chunks": 45,
    "text": "Revenue grew 25% YoY..."
  }
}
```

### 4. Query Understanding

#### User Query Processing

When user asks: *"What was the revenue growth in Q4?"*

**Step 1: Query Embedding**
```python
query_vector = finbert.encode("What was the revenue growth in Q4?")
```

**Step 2: Vector Search**
```python
results = pinecone.query(
    vector=query_vector,
    top_k=5,
    include_metadata=True
)
```

**Step 3: Similarity Scoring**
- Pinecone computes cosine similarity
- Returns top-k most similar chunks
- Scores range from 0 (dissimilar) to 1 (identical)

### 5. Context Retrieval

The system retrieves relevant chunks and assembles context:

```python
context = "\n\n".join([
    result.metadata["text"] 
    for result in search_results
])
```

**Retrieval Strategy**:
- Default: Top 5 chunks
- Configurable: 3, 5, or 10 chunks
- Ranked by similarity score
- Deduplicated by document

### 6. Answer Generation (RAG)

#### Prompt Engineering

The system constructs a carefully designed prompt:

```python
prompt = f"""
You are a helpful financial analyst assistant.
When the user asks for financial figures, extract exact numbers from context.
Include: amount, currency, period, and trend.
Cite sources using filenames and chunk indices.
Do not invent numbers not present in context.

Context (verbatim excerpts):
{retrieved_context}

User question: {user_query}

Provide a precise, professional answer:
"""
```

#### LLM Processing

**Gemini Model Selection**:
1. Try `gemini-2.5-flash` (latest)
2. Fallback to `gemini-2.0-flash`
3. Fallback to `gemini-1.5-flash`
4. Fallback to `gemini-pro`

**Generation Parameters**:
- Temperature: 0.3 (factual, less creative)
- Max tokens: 1024
- Safety settings: Block only high-risk content

#### Answer Structure

Generated answers include:
- **Direct Response**: Answers the specific question
- **Context Citations**: References source documents
- **Confidence Indicators**: "Based on Q4 2024 earnings report..."
- **Structured Data**: Tables or bullet points for metrics

### 7. Citation and Verification

Each answer includes source citations:

```json
{
  "answer": "Revenue in Q4 2024 was $50M, up 25% YoY...",
  "citations": [
    {
      "filename": "Q4_2024_Earnings.pdf",
      "document_id": "doc_abc123",
      "chunk_index": 3
    }
  ]
}
```

**Why Citations Matter**:
- **Transparency**: Users see where information comes from
- **Verification**: Users can validate answers
- **Trust**: Reduces AI hallucination concerns
- **Auditability**: Track information sources

### 8. Continuous Learning

The system improves through:

**Feedback Loop**:
- Monitor which queries succeed/fail
- Track citation accuracy
- Identify missing information gaps

**Document Updates**:
- Add new documents → immediate availability
- Delete outdated docs → clean vector space
- No retraining required

### NLC Best Practices Implemented

✅ **Domain Specialization**: FinBERT for financial terminology  
✅ **Semantic Chunking**: Context-aware text splitting  
✅ **Dense Retrieval**: Vector similarity vs. keyword matching  
✅ **Hybrid Approach**: Combines retrieval + generation  
✅ **Source Attribution**: Every claim is cited  
✅ **Graceful Degradation**: Works without LLM (returns context only)  
✅ **Metadata Filtering**: Query specific documents or date ranges  
✅ **Scalable Architecture**: Serverless vector database  

---

## 📂 Project Structure

```
financial-rag-chatbot/
│
├── frontend/                    # Client-side application
│   ├── index.html              # Main HTML page (4 views)
│   ├── css/
│   │   └── tailwind.css        # Complete styling + themes
│   ├── js/
│   │   ├── main.js             # App initialization, view switching
│   │   ├── chat.js             # Chat interface, message handling
│   │   ├── upload.js           # File upload with drag & drop
│   │   ├── db.js               # Document management
│   │   ├── nlp.js              # NLP utilities (future)
│   │   └── utils.js            # Helper functions, API calls
│   └── assets/                 # Icons, images (if any)
│
├── python_backend/             # Server-side application
│   ├── app.py                  # Flask API endpoints
│   ├── service.py              # RAG service (core logic)
│   ├── config.py               # Configuration management
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment template
│   ├── .env                    # Your API keys (gitignored)
│   ├── quick_flush.py          # Admin script to clear Pinecone
│   └── data/
│       ├── docs.json           # Document metadata (gitignored)
│       └── chats.json          # Chat history (gitignored)
│
├── start.ps1                   # PowerShell launcher script
├── .gitignore                  # Git exclusion rules
└── README.md                   # This file
```

---

## 🔧 Configuration

### Environment Variables

All settings in `python_backend/.env`:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PINECONE_API_KEY` | ✅ Yes | - | Pinecone API authentication |
| `GEMINI_API_KEY` | ✅ Yes | - | Google Gemini API key |
| `PINECONE_INDEX_NAME` | No | `financial-rag` | Vector index name |
| `PINECONE_ENVIRONMENT` | No | `us-east-1` | AWS region |
| `EMBEDDING_MODEL` | No | `ProsusAI/finbert` | Embedding model |
| `CHUNK_SIZE` | No | `500` | Characters per chunk |
| `CHUNK_OVERLAP` | No | `50` | Overlap between chunks |
| `PORT` | No | `5000` | Flask server port |

### Customization

**Adjust Chunking Strategy**:
```python
# config.py
CHUNK_SIZE = 300  # Smaller chunks = more granular
CHUNK_OVERLAP = 100  # More overlap = better continuity
```

**Change Embedding Model**:
```python
# config.py
EMBEDDING_MODEL_NAME = "sentence-transformers/all-mpnet-base-v2"
EMBEDDING_DIMENSION = 768  # Must match model output
```

**Configure Search**:
```python
# config.py
DEFAULT_TOP_K = 10  # Retrieve more chunks
MAX_CONTEXT_LENGTH = 8000  # Larger context window
```

---

## 🐛 Troubleshooting

### Common Issues

**Import Error: openpyxl not found**
```powershell
pip install openpyxl==3.1.5
```

**Pinecone Connection Failed**
- Check API key in `.env`
- Verify index name exists
- Check network connectivity

**LLM Not Responding**
- Validate Gemini API key
- Check API quota/limits
- Review error logs

**Upload Fails**
- Check file format is supported
- Verify file isn't corrupted
- Check file size (<10MB recommended)

**Slow Performance**
- Reduce `top_k` value
- Decrease `CHUNK_SIZE`
- Check Pinecone region latency

### Logs and Debugging

Enable debug mode:
```python
# app.py
app.run(debug=True, port=5000)
```

View detailed logs:
```powershell
# Console output shows:
# - Document processing steps
# - Vector counts
# - Query times
# - Error stack traces
```

---

## 📊 Performance Metrics

- **Query Response**: < 2 seconds (including LLM)
- **Upload Processing**: ~5 seconds per 10-page PDF
- **Vector Search**: < 50ms (Pinecone)
- **Embedding Generation**: ~100ms per chunk batch

---

## 🔐 Security Notes

- **Never commit** `.env` files with API keys
- **Use HTTPS** in production environments
- **Implement authentication** for multi-user deployments
- **Sanitize inputs** to prevent injection attacks
- **Rate limit** API endpoints to prevent abuse

---

## 🤝 Contributing

This is a reference implementation. To extend:

1. **Add File Formats**: Create new `_extract_*` methods in `service.py`
2. **Custom Embeddings**: Swap FinBERT in `config.py`
3. **Alternative LLMs**: Modify LLM section in `service.py`
4. **UI Enhancements**: Edit files in `frontend/`

---

## 📄 License

MIT License - Free for personal and commercial use.

---

## 🙋 Support

- **Documentation**: See inline code comments
- **Architecture**: Review `python_backend/service.py` for RAG flow
- **Frontend**: Examine `frontend/js/` for UI logic

---

**Built with ❤️ using Flask, Pinecone, FinBERT, and Gemini**

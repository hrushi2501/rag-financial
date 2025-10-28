# Financial RAG Chatbot

A production-ready Retrieval-Augmented Generation (RAG) chatbot specialized in financial document analysis. Built with Node.js, Express, Pinecone (vector DB), and Google Gemini API.

## 🌟 Features

- **Multi-format Document Upload**: Support for PDF, DOCX, TXT, and CSV files
- **Intelligent Text Processing**: Advanced NLP pipeline with chunking and preprocessing
- **Semantic Search**: Vector-based similarity search using Pinecone
- **Context-Aware Responses**: AI-powered answers with source citations
- **Real-time Chat Interface**: Clean, minimalist UI with conversation history
- **Source Attribution**: Every answer includes references to source documents
- **Scalable Architecture**: Built for production with error handling and retry logic

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────┐      ┌──────────────┐
│   Frontend  │─────▶│   Express    │─────▶│   Pinecone    │
│  (Vanilla   │      │   Backend    │      │  (Vectors)    │
│    JS)      │◀─────│              │◀─────│              │
└─────────────┘      └──────────────┘      └──────────────┘
            │
            ▼
          ┌──────────────┐
          │ Gemini API   │
          │ (Embeddings  │
          │  & LLM)      │
          └──────────────┘
```

## 🔄 NLP Pipeline

The chatbot processes documents through a 7-step pipeline:

1. **Text Extraction**: Extract content from uploaded files (PDF/DOCX/TXT/CSV)
2. **Preprocessing**: Clean text, normalize Unicode, remove special characters
3. **Tokenization**: Split text into sentences and tokens
4. **Chunking**: Divide into overlapping chunks (500 tokens, 50 overlap)
5. **Embedding Generation**: Convert chunks to 768-dimensional vectors using Gemini (text-embedding-004)
6. **Vector Storage**: Store embeddings in Pinecone (serverless index, cosine similarity)
7. **Semantic Search**: Retrieve relevant context using cosine similarity (default threshold: 0.3 for higher recall)

Optional OCR: For DOC/DOCX images, Tesseract OCR extracts text from embedded images and appends to extracted text.

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- Pinecone API key and index (dimension 768, cosine)
- Google Gemini API key

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/financial-rag-chatbot.git
cd financial-rag-chatbot
```

1. **Install dependencies**

```bash
npm install
```

1. **Configure environment variables**

```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `GEMINI_API_KEY`: Google Gemini API key
- `CHAT_MODEL`: e.g., `gemini-2.5-flash`
- `EMBEDDING_MODEL`: `text-embedding-004`
- `PINECONE_API_KEY`
- `PINECONE_INDEX_NAME`
- `PORT`: Server port (default: 3000)
- `OCR_ENABLED`: `true`/`false` and `OCR_LANGUAGE` (e.g., `eng`)

1. **Start the server**

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

1. **Open the application**

```text
http://localhost:3000
```

## 📚 API Endpoints

### Document Upload

```http
POST /api/upload
Content-Type: multipart/form-data

Response:
{
  "success": true,
  "document": { "id": "uuid", "chunksProcessed": 42, "processingTime": "1.2s" },
  "message": "Document processed successfully"
}
```

### Semantic Search

```http
POST /api/search
Content-Type: application/json

{
  "query": "What are the revenue projections?"
}

Response:
{
  "results": [
    {
      "content": "Revenue projections for Q4...",
      "score": 0.89,
      "metadata": {
        "documentId": "uuid",
        "filename": "report.pdf",
        "chunkIndex": 5
      }
    }
  ],
  "count": 5
}
```

### Chat Completion

```http
POST /api/chat
Content-Type: application/json

{
  "message": "Explain the revenue trends",
  "conversationId": "optional-uuid"
}

Response:
{
  "response": "Based on the uploaded documents...",
  "citations": [
    { "document": "financial_report.pdf", "chunkIndex": 3 }
  ],
  "conversationId": "uuid"
}
```

### List Documents

```http
GET /api/docs

Response:
{
  "success": true,
  "count": 2,
  "documents": [
    {
      "document_id": "uuid",
      "filename": "report.pdf",
      "file_type": "pdf",
      "total_chunks": 42,
      "upload_date": "2025-10-28T10:30:00Z"
    }
  ]
}
```

## 🛠️ Tech Stack

**Frontend:**

- Vanilla JavaScript (ES6+)
- Tailwind CSS
- HTML5
- Light/Dark theme toggle
- Loading spinners (documents, chat typing indicator)

**Backend:**

- Node.js & Express
- Pinecone serverless index
- Google Gemini API

**NLP & AI:**

- Gemini text-embedding-004 (embeddings)
- Gemini 2.5 Flash (LLM)
- Natural.js (tokenization)
- Tiktoken (token counting)

**Document Processing:**

- pdf-parse (PDF text extraction)
- mammoth (DOCX text extraction)
- csv-parse (CSV parsing)
- tesseract.js (OCR for DOCX embedded images)

## 📂 Project Structure

```text
financial-rag-chatbot/
├── backend/
│   ├── server.js           # Express server
│   ├── routes/             # API endpoints
│   ├── nlp/                # NLP processing
│   ├── db/                 # Database interface
│   └── utils.js            # Helper functions
├── frontend/
│   ├── index.html          # Main UI
│   ├── css/                # Styles
│   └── js/                 # Client-side logic
├── docs/                   # Documentation
├── test/                   # Test files
├── .env                    # Environment variables
└── package.json
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage report
npm test -- --coverage
```

## 🔧 Troubleshooting

### Health & Degraded Mode

The header shows Online / Degraded / Offline. Degraded typically means Pinecone or the embeddings test was slow/unavailable; the app still works but some features may retry. If it persists, check Pinecone status and your API quotas.

### API Rate Limiting / Overload

The chatbot auto-retries transient 503/429 errors with backoff. If you encounter repeated errors:
- Check your Gemini and Pinecone quotas
- Reduce concurrent uploads/queries
- Try again in a few seconds

### File Upload Failures

- Verify `MAX_FILE_SIZE` (default: 10MB)
- Check `UPLOAD_DIR` has write permissions
- Ensure file type is supported (PDF, DOCX, TXT, CSV)
- For scanned PDFs, enable OCR via an external service (e.g., Google Vision) or pre-process with OCRmyPDF. This repo currently OCRs images embedded in DOCX when `OCR_ENABLED=true`.

### Slow Search Performance

- Tune similarity threshold (lower = more recall, less precision). Default is 0.3.
- Adjust `topK` for more/less context returned.

## 🔒 Security

- API keys stored in environment variables
- CORS configured for specific origins
- File upload validation and size limits
- SQL injection prevention with parameterized queries
- Rate limiting on API endpoints

## 📖 Documentation

- [Architecture Details](docs/architecture.md)
- [NLP Pipeline Explanation](docs/nlp_steps.md)
- [API Reference](docs/api_reference.md)

## 🤝 Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Google Gemini API for embeddings and LLM
- Pinecone for vector similarity search
- Natural.js for NLP utilities

---

**Built with ❤️ for financial document analysis**

# Financial RAG Chatbot

A production-ready Retrieval-Augmented Generation (RAG) chatbot specialized in financial document analysis. Built with Node.js, Express, PostgreSQL with pgvector, and Google Gemini API.

## 🌟 Features

- **Multi-format Document Upload**: Support for PDF, DOCX, TXT, and CSV files
- **Intelligent Text Processing**: Advanced NLP pipeline with chunking and preprocessing
- **Semantic Search**: Vector-based similarity search using pgvector
- **Context-Aware Responses**: AI-powered answers with source citations
- **Real-time Chat Interface**: Clean, minimalist UI with conversation history
- **Source Attribution**: Every answer includes references to source documents
- **Scalable Architecture**: Built for production with error handling and retry logic

## 🏗️ Architecture

```
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│   Frontend  │─────▶│   Express    │─────▶│  PostgreSQL │
│  (Vanilla   │      │   Backend    │      │  + pgvector │
│    JS)      │◀─────│              │◀─────│             │
└─────────────┘      └──────────────┘      └─────────────┘
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
5. **Embedding Generation**: Convert chunks to 768-dimensional vectors using Gemini
6. **Vector Storage**: Store embeddings in PostgreSQL with pgvector extension
7. **Semantic Search**: Retrieve relevant context using cosine similarity (threshold: 0.75)

## 🚀 Quick Start

### Prerequisites

- Node.js 18.x or higher
- PostgreSQL 12+ with pgvector extension
- Google Gemini API key

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/financial-rag-chatbot.git
cd financial-rag-chatbot
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up PostgreSQL with pgvector**
```bash
# Install pgvector extension
psql -d your_database -c "CREATE EXTENSION vector;"
```

4. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your credentials
```

Required variables:
- `GEMINI_API_KEY`: Your Google Gemini API key
- `DATABASE_URL`: PostgreSQL connection string
- `PORT`: Server port (default: 3000)

5. **Initialize database**
```bash
npm run db:migrate
```

6. **Start the server**
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

7. **Open the application**
```
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
  "documentId": "uuid",
  "chunksProcessed": 42,
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
  "answer": "Based on the uploaded documents...",
  "sources": [
    {
      "document": "financial_report.pdf",
      "chunkIndex": 3
    }
  ],
  "conversationId": "uuid"
}
```

### List Documents
```http
GET /api/docs

Response:
{
  "documents": [
    {
      "id": "uuid",
      "filename": "report.pdf",
      "uploadDate": "2025-10-28T10:30:00Z",
      "chunks": 42
    }
  ]
}
```

## 🛠️ Tech Stack

**Frontend:**
- Vanilla JavaScript (ES6+)
- Tailwind CSS
- HTML5

**Backend:**
- Node.js & Express
- PostgreSQL with pgvector
- Google Gemini API

**NLP & AI:**
- Gemini text-embedding-004 (embeddings)
- Gemini 1.5 Pro (LLM)
- Natural.js (tokenization)
- Tiktoken (token counting)

**Document Processing:**
- pdf-parse (PDF extraction)
- mammoth (DOCX extraction)
- csv-parse (CSV parsing)

## 📂 Project Structure

```
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

### Database Connection Issues
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Verify pgvector extension
psql -d your_database -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

### API Rate Limiting
The chatbot implements retry logic with exponential backoff. If you encounter rate limits:
- Check your Gemini API quota
- Adjust `API_RETRY_ATTEMPTS` in .env
- Consider implementing request queuing

### File Upload Failures
- Verify `MAX_FILE_SIZE` (default: 10MB)
- Check `UPLOAD_DIR` has write permissions
- Ensure file type is supported (PDF, DOCX, TXT, CSV)

### Slow Search Performance
- Create indexes on vector columns:
```sql
CREATE INDEX ON documents USING ivfflat (embedding vector_cosine_ops);
```
- Adjust `SIMILARITY_THRESHOLD` (lower = more results, less relevant)

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
- pgvector for vector similarity search
- Natural.js for NLP utilities

---

**Built with ❤️ for financial document analysis**
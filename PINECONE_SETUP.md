# 🚀 Pinecone Setup Guide - Financial RAG Chatbot

## ✅ What's Changed

Your Financial RAG Chatbot has been **successfully migrated from PostgreSQL+pgvector to Pinecone**!

### Benefits of Pinecone:
- ✅ **No local database installation** - Fully managed cloud service
- ✅ **Zero maintenance** - No PostgreSQL setup or pgvector extension
- ✅ **Scalable** - Handles millions of vectors automatically
- ✅ **Fast** - Optimized for vector similarity search
- ✅ **Free tier available** - Perfect for getting started

---

## 📋 Quick Setup (5 Minutes Total)

### Step 1: Create Pinecone Account (2 minutes)

1. Go to **https://www.pinecone.io/**
2. Click **"Sign Up Free"**
3. Create account with email or Google/GitHub
4. Verify your email

### Step 2: Create Your Index (2 minutes)

Once logged in to Pinecone console:

1. Click **"Create Index"**
2. Fill in the details:
   - **Index Name:** `financial-rag`
   - **Dimensions:** `768` ⚠️ IMPORTANT!
   - **Metric:** `cosine`
   - **Region:** Choose closest to you (US-East, EU-West, etc.)
   - **Pod Type:** `Starter` (free tier) or `s1` (paid)
3. Click **"Create Index"**
4. Wait ~1 minute for index to be ready

### Step 3: Get Your API Key (1 minute)

1. In Pinecone console, click **"API Keys"** in left sidebar
2. You'll see your API key listed
3. Click **"Copy"** button
4. Save it somewhere safe - you'll need it next!

### Step 4: Get Google Gemini API Key (1 minute)

1. Go to **https://aistudio.google.com/app/apikey**
2. Click **"Create API Key"**
3. Select a project or create new one
4. Copy the API key (starts with `AIza...`)

### Step 5: Update .env File (30 seconds)

Edit `.env` in your project folder:

```bash
# Google Gemini API Configuration
GEMINI_API_KEY=AIzaSy...your_actual_gemini_key_here

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_INDEX_NAME=financial-rag

# Server Configuration
PORT=3000
NODE_ENV=development
HOST=localhost

# File Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=pdf,docx,txt,csv

# AI Model Configuration
EMBEDDING_MODEL=text-embedding-004
LLM_MODEL=gemini-1.5-pro
VECTOR_DIMENSIONS=768

# NLP Configuration
CHUNK_SIZE=500
CHUNK_OVERLAP=50
SIMILARITY_THRESHOLD=0.75
MAX_CONTEXT_CHUNKS=5

# API Configuration
API_RETRY_ATTEMPTS=3
API_TIMEOUT=30000
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX_REQUESTS=100

# Security
CORS_ORIGIN=http://localhost:3000

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

**Replace:**
- `your_actual_gemini_key_here` - Your Gemini API key
- `your_pinecone_api_key_here` - Your Pinecone API key

### Step 6: Start the Server! (10 seconds)

```powershell
cd "c:\Users\hrush\Downloads\NLC\project\financial-rag-chatbot"
node backend/server.js
```

Expected output:
```
🚀 Starting Financial RAG System...

📊 Initializing Pinecone...
🔗 Connecting to Pinecone index: financial-rag
✅ Connected to Pinecone index: financial-rag
✓ Pinecone initialized

🧠 Testing embedding generation...
✓ Embedding generation working
  Model: text-embedding-004
  Dimensions: 768
  Test duration: 523ms

🚀 Financial RAG System running on http://localhost:3000
```

### Step 7: Test It! (2 minutes)

1. Open **http://localhost:3000** in your browser
2. Upload a test PDF document
3. Wait for processing (you'll see progress)
4. Go to Chat tab
5. Ask: "What is this document about?"
6. See AI response with source citations!

---

## 📊 What Was Changed in the Code

### Files Updated:

1. **`backend/db/pinecone.js`** - NEW FILE
   - Complete Pinecone database interface
   - All vector operations (insert, search, delete)
   - Health checks and stats

2. **`backend/routes/upload.js`**
   - Changed: `require('../db/pgvector')` → `require('../db/pinecone')`
   - No other changes needed!

3. **`backend/routes/search.js`**
   - Changed: `searchDocuments()` → `searchSimilarVectors()`
   - Updated result format

4. **`backend/routes/chat.js`**
   - Changed: `searchDocuments()` → `searchSimilarVectors()`
   - Updated context chunk format

5. **`backend/routes/docs.js`**
   - Changed: Import from `pinecone.js` instead of `pgvector.js`

6. **`backend/server.js`**
   - Changed: `initializeDatabase()` → `initializePinecone()`

7. **`package.json`**
   - Added: `"@pinecone-database/pinecone": "^3.0.3"`
   - Removed: `"pg"` and `"pgvector"`

8. **`.env`**
   - Replaced PostgreSQL variables with Pinecone variables
   - Added: `PINECONE_API_KEY` and `PINECONE_INDEX_NAME`

---

## 🎯 System Architecture

```
User Upload (PDF/DOCX/TXT/CSV)
         ↓
[Text Extraction] (pdf-parse, mammoth, csv-parse)
         ↓
[Preprocessing] (clean text, normalize)
         ↓
[Tokenization] (tiktoken - GPT-3.5-turbo)
         ↓
[Chunking] (500 tokens with 50 overlap)
         ↓
[Embedding] (Gemini text-embedding-004 → 768d vectors)
         ↓
[Store in Pinecone] (cloud vector database)
         ↓
[User Query] → [Query Embedding] → [Pinecone Search] (cosine similarity)
         ↓
[Top K Chunks] (similarity > 0.75)
         ↓
[RAG] (chunks + query → Gemini LLM → answer)
         ↓
[Response with Citations]
```

---

## 🔍 How Pinecone Works in Your App

### Document Upload Flow:
1. User uploads document
2. Text extracted and chunked into 500-token segments
3. Each chunk converted to 768d vector via Gemini API
4. Vectors uploaded to Pinecone with metadata:
   - `documentId` - Unique document identifier
   - `chunkText` - The actual text content
   - `chunkIndex` - Position in document
   - `tokenCount` - Number of tokens

### Search Flow:
1. User enters query
2. Query converted to 768d vector
3. Pinecone finds most similar vectors (cosine similarity)
4. Returns top K chunks above similarity threshold (0.75)
5. Results ranked by similarity score

### Chat Flow:
1. User asks question
2. Question embedded → Search Pinecone for context
3. Top 5 relevant chunks retrieved
4. Chunks + question sent to Gemini LLM
5. AI generates grounded response with citations

---

## 💡 Pinecone Features Used

### Vector Operations:
- **`index.upsert()`** - Insert/update vectors
- **`index.query()`** - Similarity search
- **`index.deleteMany()`** - Delete by filter
- **`index.describeIndexStats()`** - Get statistics

### Metadata Filtering:
```javascript
// Search specific document
await index.query({
    vector: queryEmbedding,
    topK: 10,
    filter: {
        documentId: { $eq: 'doc_123' }
    }
});
```

### Batch Operations:
- Uploads vectors in batches of 100 (Pinecone limit)
- Efficient bulk operations

---

## 📈 Performance

### Pinecone vs PostgreSQL:

| Metric | Pinecone | PostgreSQL+pgvector |
|--------|----------|---------------------|
| **Setup Time** | 5 minutes | 30+ minutes |
| **Maintenance** | Zero | Manual updates |
| **Search Speed** | ~50-100ms | ~100-200ms |
| **Scalability** | Millions of vectors | Thousands |
| **Cost** | Free tier, then $70+/mo | Free (self-hosted) |
| **Reliability** | 99.9% uptime SLA | Depends on hosting |

---

## 🔧 Troubleshooting

### Error: "Index not found"

**Solution:**
1. Check index name in `.env` matches Pinecone console
2. Verify index has been created and is active
3. Check API key is correct

### Error: "Incorrect authentication credentials"

**Solution:**
1. Verify `PINECONE_API_KEY` in `.env` is correct
2. API key should have no quotes or extra spaces
3. Regenerate API key if needed

### Error: "dimension mismatch"

**Solution:**
1. Index MUST be created with **768 dimensions**
2. Cannot change after creation
3. Delete and recreate index if wrong

### Error: "Rate limit exceeded"

**Solution:**
- Free tier has limits (100 operations/min)
- Add delays between operations
- Upgrade to paid tier for higher limits

### Slow Upload Times

**Causes:**
- Gemini API rate limits (embeddings take time)
- Large documents with many chunks
- Network latency

**Solutions:**
- Be patient (100-chunk doc = ~30 seconds)
- Check console logs for progress
- Consider batch size optimization

---

## 💰 Pinecone Pricing

### Starter Plan (FREE):
- 1 index
- Up to 100,000 vectors
- 1 pod (1 replica)
- Perfect for testing and small projects

### Standard Plan ($70+/month):
- Multiple indexes
- Millions of vectors
- Multiple pods
- High-performance search
- Production-ready

**For this project:**
- Start with FREE tier
- Monitor usage in Pinecone dashboard
- Upgrade when needed

---

## 🎓 Pinecone Resources

### Official Documentation:
- **Getting Started:** https://docs.pinecone.io/docs/quickstart
- **Node.js SDK:** https://docs.pinecone.io/docs/node-client
- **Best Practices:** https://docs.pinecone.io/docs/choosing-index-type-and-size

### Useful Links:
- **Console:** https://app.pinecone.io/
- **Status Page:** https://status.pinecone.io/
- **Community:** https://community.pinecone.io/

---

## 🚀 Next Steps

1. ✅ **Setup Complete** - Follow steps above
2. 📤 **Upload Documents** - Test with financial PDFs
3. 🔍 **Test Search** - Try semantic queries
4. 💬 **Test Chat** - Ask questions about your docs
5. 📊 **Monitor Usage** - Check Pinecone dashboard
6. 🎯 **Optimize** - Adjust similarity threshold if needed

---

## 📝 Quick Commands

```powershell
# Start server
node backend/server.js

# Check logs
# Server logs shown in console

# Test health endpoint
curl http://localhost:3000/api/health

# View Pinecone stats
# Check server startup logs or Pinecone console
```

---

## ✨ Summary

### What You Get:
- ✅ No PostgreSQL installation needed
- ✅ Managed cloud vector database
- ✅ Fast similarity search
- ✅ Automatic scaling
- ✅ 99.9% uptime
- ✅ Easy setup (5 minutes)

### What You Need:
1. Pinecone account + API key
2. Gemini API key
3. Update `.env` file
4. Start server

**That's it! No database installation, no migrations, no maintenance!**

---

## 🎉 You're Ready!

Your Financial RAG Chatbot is now powered by Pinecone. Just:
1. Create Pinecone index
2. Get API keys
3. Update `.env`
4. Start server
5. Upload & chat!

**Total time: ~5 minutes** ⚡

---

**Questions?** Check Pinecone docs or review the code in `backend/db/pinecone.js`

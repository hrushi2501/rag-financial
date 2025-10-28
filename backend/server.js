// Simple Express server wiring routes, middleware, and health checks

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import routes
const uploadRouter = require('./routes/upload');
const searchRouter = require('./routes/search');
const chatRouter = require('./routes/chat');
const docsRouter = require('./routes/docs');

// Import Pinecone initialization
const { initializePinecone, healthCheck } = require('./db/pinecone');
const { testEmbeddingGeneration } = require('./nlp/embeddings');

// App setup
const app = express();
const PORT = process.env.PORT || 3000;

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"]
        }
    }
}));

app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    // Create logs directory
    const logsDir = path.join(__dirname, '../logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const accessLogStream = fs.createWriteStream(
        path.join(logsDir, 'access.log'),
        { flags: 'a' }
    );
    app.use(morgan('combined', { stream: accessLogStream }));
}

// Static frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api/upload', uploadRouter);
app.use('/api/search', searchRouter);
app.use('/api/chat', chatRouter);
app.use('/api/docs', docsRouter);

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const dbHealth = await healthCheck();
        const embeddingHealth = await testEmbeddingGeneration();

    const status = dbHealth.connected && embeddingHealth.success ? 'healthy' : 'degraded';
        const statusCode = status === 'healthy' ? 200 : 503;

        res.status(statusCode).json({
            status,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            database: {
                connected: dbHealth.connected,
                latency: dbHealth.latency
            },
            embedding: {
                operational: embeddingHealth.success,
                model: process.env.EMBEDDING_MODEL || 'text-embedding-004',
                dimensions: embeddingHealth.dimensions
            },
            memory: {
                usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
            }
        });

    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// API info
app.get('/api', (req, res) => {
    res.json({
        name: 'Financial RAG System API',
        version: '1.0.0',
        description: 'Semantic search and chat over financial documents using RAG',
        endpoints: {
            upload: {
                'POST /api/upload': 'Upload and process documents',
                'POST /api/upload/text': 'Process raw text'
            },
            search: {
                'POST /api/search': 'Semantic search',
                'POST /api/search/hybrid': 'Hybrid vector + keyword search',
                'POST /api/search/similar': 'Find similar chunks',
                'POST /api/search/document': 'Search within document'
            },
            chat: {
                'POST /api/chat': 'RAG-based chat completion',
                'POST /api/chat/stream': 'Streaming chat responses',
                'GET /api/chat/history/:id': 'Get conversation history',
                'POST /api/chat/summarize': 'Summarize text'
            },
            docs: {
                'GET /api/docs': 'List all documents',
                'GET /api/docs/:id': 'Get document details',
                'DELETE /api/docs/:id': 'Delete document',
                'GET /api/docs/:id/chunks': 'Get document chunks',
                'GET /api/docs/:id/stats': 'Get document statistics'
            },
            system: {
                'GET /api/health': 'System health check',
                'GET /api': 'API information'
            }
        },
        documentation: 'See README.md for detailed documentation'
    });
});

// Fallback to SPA index
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

// Track server for shutdown
let serverInstance = null;

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down...');
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down...');
    if (serverInstance) {
        serverInstance.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    } else {
        process.exit(0);
    }
});

// Boot
async function startServer() {
    try {
    console.log('Starting Financial RAG System...');

        // Initialize Pinecone
    console.log('Initializing Pinecone...');
        await initializePinecone();
    console.log('Pinecone ready');

        // Test embedding generation
    console.log('Testing embeddings...');
        const embeddingTest = await testEmbeddingGeneration();
        if (embeddingTest.success) {
            console.log(`Embeddings OK — model=${process.env.EMBEDDING_MODEL || 'text-embedding-004'}, dim=${embeddingTest.dimensions}, duration=${embeddingTest.duration}`);
        } else {
            console.warn('Embedding test failed:', embeddingTest.error, '(server will still start)');
        }

        // Start server
        serverInstance = app.listen(PORT, () => {
            console.log(`Server listening on http://localhost:${PORT}`);
            console.log(`API:     http://localhost:${PORT}/api`);
            console.log(`Health:  http://localhost:${PORT}/api/health`);
        });

        return serverInstance;

    } catch (error) {
    console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = app;
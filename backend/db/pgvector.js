/**
 * PostgreSQL with pgvector Database Interface
 * Handles vector storage, retrieval, and similarity search
 */

const { Pool } = require('pg');
const pgvector = require('pgvector/pg');
require('dotenv').config();

// Create connection pool for better performance
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Test connection on startup
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
    process.exit(-1);
});

/**
 * Initialize database schema with pgvector extension and tables
 */
async function createVectorTable() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('pgvector extension enabled');

        // Create documents table
        await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(10) NOT NULL,
        file_size INTEGER NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_chunks INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}'::jsonb
      )
    `);
    console.log('Documents table created');

        // Create vectors table with pgvector column
        const vectorDimensions = process.env.VECTOR_DIMENSIONS || 768;
        await client.query(`
      CREATE TABLE IF NOT EXISTS vectors (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(${vectorDimensions}) NOT NULL,
        token_count INTEGER,
        start_position INTEGER,
        end_position INTEGER,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Vectors table created');

        // Create indexes for better search performance
        await client.query(`
      CREATE INDEX IF NOT EXISTS vectors_document_id_idx 
      ON vectors(document_id)
    `);

        await client.query(`
      CREATE INDEX IF NOT EXISTS vectors_embedding_idx 
      ON vectors USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
    console.log('Indexes created');

        // Create conversations table for chat history
        await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_message TEXT NOT NULL,
        bot_response TEXT NOT NULL,
        sources JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Conversations table created');

    await client.query('COMMIT');
    console.log('Database schema initialized successfully');

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating vector table:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Insert document metadata and return document ID
 * @param {Object} docInfo - Document information
 * @returns {Promise<string>} Document UUID
 */
async function insertDocument(docInfo) {
    const { filename, fileType, fileSize, metadata = {} } = docInfo;

    const query = `
    INSERT INTO documents (filename, file_type, file_size, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `;

    try {
        const result = await pool.query(query, [
            filename,
            fileType,
            fileSize,
            JSON.stringify(metadata)
        ]);

        return result.rows[0].id;
    } catch (error) {
        console.error('Error inserting document:', error);
        throw error;
    }
}

/**
 * Batch insert vectors with embeddings into database
 * @param {string} documentId - UUID of the document
 * @param {Array} chunks - Array of chunk objects with text and metadata
 * @param {Array} embeddings - Array of embedding vectors
 * @returns {Promise<number>} Number of vectors inserted
 */
async function insertVectors(documentId, chunks, embeddings) {
    if (chunks.length !== embeddings.length) {
        throw new Error('Chunks and embeddings arrays must have same length');
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Prepare batch insert with pgvector
        const insertPromises = chunks.map(async (chunk, index) => {
            const query = `
        INSERT INTO vectors (
          document_id, chunk_index, content, embedding, 
          token_count, start_position, end_position, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `;

            const values = [
                documentId,
                chunk.metadata.chunkIndex,
                chunk.text,
                pgvector.toSql(embeddings[index]), // Convert to pgvector format
                chunk.metadata.tokenCount,
                chunk.metadata.startPosition,
                chunk.metadata.endPosition,
                JSON.stringify(chunk.metadata)
            ];

            return client.query(query, values);
        });

        await Promise.all(insertPromises);

        // Update document with total chunks
        await client.query(
            'UPDATE documents SET total_chunks = $1 WHERE id = $2',
            [chunks.length, documentId]
        );

    await client.query('COMMIT');
    console.log(`Inserted ${chunks.length} vectors for document ${documentId}`);

        return chunks.length;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error inserting vectors:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Search for similar vectors using cosine similarity
 * @param {Array} queryVector - Query embedding vector
 * @param {number} limit - Maximum number of results (default: 5)
 * @param {number} threshold - Similarity threshold (default: 0.75)
 * @returns {Promise<Array>} Array of similar chunks with metadata
 */
async function searchSimilar(queryVector, limit = 5, threshold = 0.75) {
    const query = `
    SELECT 
      v.id,
      v.content,
      v.chunk_index,
      v.metadata,
      d.filename,
      d.id as document_id,
      1 - (v.embedding <=> $1) as similarity
    FROM vectors v
    JOIN documents d ON v.document_id = d.id
    WHERE 1 - (v.embedding <=> $1) >= $2
    ORDER BY v.embedding <=> $1
    LIMIT $3
  `;

    try {
        const result = await pool.query(query, [
            pgvector.toSql(queryVector),
            threshold,
            limit
        ]);

        return result.rows.map(row => ({
            id: row.id,
            content: row.content,
            score: parseFloat(row.similarity.toFixed(4)),
            metadata: {
                documentId: row.document_id,
                filename: row.filename,
                chunkIndex: row.chunk_index,
                ...row.metadata
            }
        }));

    } catch (error) {
        console.error('Error searching similar vectors:', error);
        throw error;
    }
}

/**
 * Get all documents with their metadata
 * @returns {Promise<Array>} List of documents
 */
async function getDocuments() {
    const query = `
    SELECT 
      id, 
      filename, 
      file_type, 
      file_size, 
      upload_date, 
      total_chunks,
      metadata
    FROM documents
    ORDER BY upload_date DESC
  `;

    try {
        const result = await pool.query(query);
        return result.rows;
    } catch (error) {
        console.error('Error fetching documents:', error);
        throw error;
    }
}

/**
 * Get specific document by ID
 * @param {string} documentId - Document UUID
 * @returns {Promise<Object>} Document object
 */
async function getDocumentById(documentId) {
    const query = `
    SELECT 
      d.*,
      COUNT(v.id) as chunk_count
    FROM documents d
    LEFT JOIN vectors v ON d.id = v.document_id
    WHERE d.id = $1
    GROUP BY d.id
  `;

    try {
        const result = await pool.query(query, [documentId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error fetching document:', error);
        throw error;
    }
}

/**
 * Delete document and all associated vectors
 * @param {string} documentId - Document UUID
 * @returns {Promise<boolean>} Success status
 */
async function deleteDocument(documentId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Delete vectors (CASCADE should handle this, but explicit for clarity)
        await client.query('DELETE FROM vectors WHERE document_id = $1', [documentId]);

        // Delete document
        const result = await client.query('DELETE FROM documents WHERE id = $1 RETURNING id', [documentId]);

        await client.query('COMMIT');

        if (result.rowCount > 0) {
            console.log(`Deleted document ${documentId} and associated vectors`);
            return true;
        }

        return false;

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error deleting document:', error);
        throw error;
    } finally {
        client.release();
    }
}

/**
 * Save conversation to database
 * @param {Object} conversation - Conversation data
 * @returns {Promise<string>} Conversation ID
 */
async function saveConversation(conversation) {
    const { userMessage, botResponse, sources = [] } = conversation;

    const query = `
    INSERT INTO conversations (user_message, bot_response, sources)
    VALUES ($1, $2, $3)
    RETURNING id
  `;

    try {
        const result = await pool.query(query, [
            userMessage,
            botResponse,
            JSON.stringify(sources)
        ]);

        return result.rows[0].id;
    } catch (error) {
        console.error('Error saving conversation:', error);
        throw error;
    }
}

/**
 * Get conversation history
 * @param {number} limit - Number of recent conversations
 * @returns {Promise<Array>} Array of conversations
 */
async function getConversations(limit = 10) {
    const query = `
    SELECT id, user_message, bot_response, sources, created_at
    FROM conversations
    ORDER BY created_at DESC
    LIMIT $1
  `;

    try {
        const result = await pool.query(query, [limit]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching conversations:', error);
        throw error;
    }
}

/**
 * Close database connection pool
 */
async function closePool() {
    await pool.end();
    console.log('Database connection pool closed');
}

/**
 * Initialize database (alias for createVectorTable)
 */
async function initializeDatabase() {
    return await createVectorTable();
}

/**
 * Health check for database connection
 * @returns {Promise<Object>} Health status
 */
async function healthCheck() {
    const startTime = Date.now();

    try {
        await pool.query('SELECT 1');
        const latency = Date.now() - startTime;

        return {
            connected: true,
            latency: `${latency}ms`
        };
    } catch (error) {
        return {
            connected: false,
            error: error.message
        };
    }
}

/**
 * Get all documents with pagination and sorting
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Documents array
 */
async function getAllDocuments(options = {}) {
    const {
        limit = 50,
        offset = 0,
        sortBy = 'upload_date',
        order = 'desc'
    } = options;

    const validSortFields = ['upload_date', 'filename', 'file_size', 'total_chunks'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'upload_date';
    const sortOrder = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const query = `
        SELECT 
            id as document_id,
            filename,
            file_type,
            file_size,
            upload_date,
            total_chunks,
            metadata
        FROM documents
        ORDER BY ${sortField} ${sortOrder}
        LIMIT $1 OFFSET $2
    `;

    try {
        const result = await pool.query(query, [limit, offset]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching documents:', error);
        throw error;
    }
}

/**
 * Get document chunks
 * @param {string} documentId - Document UUID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Chunks array
 */
async function getDocumentChunks(documentId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const query = `
        SELECT 
            id as chunk_id,
            chunk_index,
            content,
            token_count,
            start_position,
            end_position,
            metadata,
            created_at
        FROM vectors
        WHERE document_id = $1
        ORDER BY chunk_index ASC
        LIMIT $2 OFFSET $3
    `;

    try {
        const result = await pool.query(query, [documentId, limit, offset]);
        return result.rows;
    } catch (error) {
        console.error('Error fetching chunks:', error);
        throw error;
    }
}

/**
 * Get single chunk by ID
 * @param {string} chunkId - Chunk UUID
 * @returns {Promise<Object>} Chunk object
 */
async function getChunkById(chunkId) {
    const query = `
        SELECT 
            v.*,
            d.filename,
            d.file_type
        FROM vectors v
        JOIN documents d ON v.document_id = d.id
        WHERE v.id = $1
    `;

    try {
        const result = await pool.query(query, [chunkId]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('Error fetching chunk:', error);
        throw error;
    }
}

/**
 * Delete chunk by ID
 * @param {string} chunkId - Chunk UUID
 * @returns {Promise<boolean>} Success status
 */
async function deleteChunk(chunkId) {
    try {
        const result = await pool.query(
            'DELETE FROM vectors WHERE id = $1 RETURNING id',
            [chunkId]
        );
        return result.rowCount > 0;
    } catch (error) {
        console.error('Error deleting chunk:', error);
        throw error;
    }
}

/**
 * Update document metadata
 * @param {string} documentId - Document UUID
 * @param {Object} metadata - New metadata
 * @returns {Promise<boolean>} Success status
 */
async function updateDocumentMetadata(documentId, metadata) {
    const query = `
        UPDATE documents
        SET metadata = $1
        WHERE id = $2
        RETURNING id
    `;

    try {
        const result = await pool.query(query, [
            JSON.stringify(metadata),
            documentId
        ]);
        return result.rowCount > 0;
    } catch (error) {
        console.error('Error updating document metadata:', error);
        throw error;
    }
}

/**
 * Get document statistics
 * @param {string} documentId - Document UUID
 * @returns {Promise<Object>} Document stats
 */
async function getDocumentStats(documentId) {
    const query = `
        SELECT 
            COUNT(v.id) as total_chunks,
            AVG(v.token_count)::int as avg_tokens_per_chunk,
            SUM(v.token_count) as total_tokens,
            MIN(v.created_at) as first_chunk_created,
            MAX(v.created_at) as last_chunk_created
        FROM vectors v
        WHERE v.document_id = $1
    `;

    try {
        const result = await pool.query(query, [documentId]);
        return result.rows[0] || {};
    } catch (error) {
        console.error('Error fetching document stats:', error);
        throw error;
    }
}

/**
 * Search documents with vector similarity
 * @param {Array} queryVector - Query embedding
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
async function searchDocuments(queryVector, options = {}) {
    const {
        topK = 10,
        threshold = 0.5,
        filters = {}
    } = options;

    let query = `
        SELECT 
            v.id as chunk_id,
            v.content,
            v.chunk_index,
            v.metadata,
            d.id as document_id,
            d.filename as document_name,
            1 - (v.embedding <=> $1) as similarity
        FROM vectors v
        JOIN documents d ON v.document_id = d.id
        WHERE 1 - (v.embedding <=> $1) >= $2
    `;

    const params = [pgvector.toSql(queryVector), threshold];
    let paramCount = 2;

    // Add filters if provided
    if (filters.documentId) {
        paramCount++;
        query += ` AND d.id = $${paramCount}`;
        params.push(filters.documentId);
    }

    if (filters.fileType) {
        paramCount++;
        query += ` AND d.file_type = $${paramCount}`;
        params.push(filters.fileType);
    }

    query += `
        ORDER BY v.embedding <=> $1
        LIMIT $${paramCount + 1}
    `;
    params.push(topK);

    try {
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        console.error('Error searching documents:', error);
        throw error;
    }
}

/**
 * Hybrid search combining vector similarity and keyword matching
 * @param {Array} queryVector - Query embedding
 * @param {string} keywords - Search keywords
 * @param {Object} options - Search options
 * @returns {Promise<Array>} Search results
 */
async function hybridSearch(queryVector, keywords, options = {}) {
    const { topK = 10, threshold = 0.5 } = options;

    const query = `
        SELECT 
            v.id as chunk_id,
            v.content,
            v.chunk_index,
            v.metadata,
            d.id as document_id,
            d.filename as document_name,
            (1 - (v.embedding <=> $1)) * 0.7 + 
            (ts_rank(to_tsvector('english', v.content), plainto_tsquery('english', $2)) * 0.3) as score
        FROM vectors v
        JOIN documents d ON v.document_id = d.id
        WHERE 
            (1 - (v.embedding <=> $1)) >= $3
            OR to_tsvector('english', v.content) @@ plainto_tsquery('english', $2)
        ORDER BY score DESC
        LIMIT $4
    `;

    try {
        const result = await pool.query(query, [
            pgvector.toSql(queryVector),
            keywords,
            threshold,
            topK
        ]);
        return result.rows;
    } catch (error) {
        console.error('Error performing hybrid search:', error);
        throw error;
    }
}

// Export all functions
module.exports = {
    pool,
    createVectorTable,
    initializeDatabase,
    healthCheck,
    insertDocument,
    insertVectors,
    searchSimilar,
    searchDocuments,
    hybridSearch,
    getDocuments,
    getAllDocuments,
    getDocumentById,
    getDocumentChunks,
    getChunkById,
    deleteDocument,
    deleteChunk,
    updateDocumentMetadata,
    getDocumentStats,
    saveConversation,
    getConversations,
    closePool
};
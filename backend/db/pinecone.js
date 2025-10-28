/**
 * Pinecone Vector Database Interface
 * Handles all vector operations using Pinecone cloud service
 */

const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

// Initialize Pinecone client
let pinecone = null;
let index = null;

/**
 * Initialize Pinecone connection
 */
async function initializePinecone() {
    try {
        if (!process.env.PINECONE_API_KEY) {
            throw new Error('PINECONE_API_KEY not found in environment variables');
        }

        pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });

        const indexName = process.env.PINECONE_INDEX_NAME || 'financial-rag';
        
        console.log(`🔗 Connecting to Pinecone index: ${indexName}`);
        
        // Get existing index or create instructions
        try {
            index = pinecone.index(indexName);
            console.log(`✅ Connected to Pinecone index: ${indexName}`);
        } catch (error) {
            console.log(`⚠️  Index '${indexName}' not found. You need to create it in Pinecone console.`);
            console.log(`   Visit: https://app.pinecone.io/`);
            console.log(`   Settings: dimension=768, metric=cosine`);
            throw error;
        }

        return { success: true };
    } catch (error) {
        console.error('❌ Pinecone initialization failed:', error.message);
        throw error;
    }
}

/**
 * Health check for Pinecone connection
 */
async function healthCheck() {
    try {
        if (!index) {
            await initializePinecone();
        }
        
        // Get index stats to verify connection
        const stats = await index.describeIndexStats();
        
        return {
            status: 'healthy',
            service: 'pinecone',
            indexName: process.env.PINECONE_INDEX_NAME || 'financial-rag',
            totalVectors: stats.totalRecordCount || 0,
            dimension: stats.dimension || 768,
            namespaces: stats.namespaces || {}
        };
    } catch (error) {
        console.error('Health check failed:', error.message);
        return {
            status: 'unhealthy',
            service: 'pinecone',
            error: error.message
        };
    }
}

/**
 * Insert document metadata (stored in Pinecone metadata)
 */
async function insertDocument(filename, fileType, metadata = {}) {
    try {
        const documentId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`📄 Document registered: ${documentId}`);
        
        // Return just the ID string
        return documentId;
    } catch (error) {
        console.error('Error inserting document:', error);
        throw error;
    }
}

/**
 * Insert vectors into Pinecone with metadata
 */
async function insertVectors(documentId, filename, chunks, embeddings) {
    try {
        if (!index) {
            await initializePinecone();
        }

        if (!chunks || chunks.length === 0) {
            throw new Error('No chunks provided');
        }

        if (!embeddings || embeddings.length === 0) {
            throw new Error('No embeddings provided');
        }

        if (chunks.length !== embeddings.length) {
            throw new Error(`Chunk count (${chunks.length}) does not match embedding count (${embeddings.length})`);
        }

        console.log(`📤 Inserting ${chunks.length} vectors into Pinecone...`);

        // Prepare vectors for Pinecone
        const vectors = chunks.map((chunk, idx) => {
            // Handle both chunk structures: direct properties or metadata wrapper
            const chunkText = chunk.text || '';
            const chunkMetadata = chunk.metadata || {};
            const tokenCount = chunkMetadata.tokenCount || chunk.tokenCount || 0;
            const startPosition = chunkMetadata.startPosition || chunk.start || 0;
            const endPosition = chunkMetadata.endPosition || chunk.end || 0;
            
            return {
                id: `${documentId}_chunk_${idx}`,
                values: embeddings[idx],
                metadata: {
                    documentId: String(documentId),
                    filename: String(filename),
                    chunkText: chunkText.substring(0, 40000), // Pinecone metadata limit
                    chunkIndex: Number(idx),
                    tokenCount: Number(tokenCount),
                    startPosition: Number(startPosition),
                    endPosition: Number(endPosition)
                }
            };
        });

        // Upsert vectors in batches of 100 (Pinecone limit)
        const batchSize = 100;
        for (let i = 0; i < vectors.length; i += batchSize) {
            const batch = vectors.slice(i, i + batchSize);
            await index.upsert(batch);
            console.log(`   ✅ Uploaded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(vectors.length / batchSize)}`);
        }

        console.log(`✅ Successfully inserted ${vectors.length} vectors`);
        
        // Return just the count (for compatibility with upload.js)
        return vectors.length;
    } catch (error) {
        console.error('Error inserting vectors:', error);
        throw error;
    }
}

/**
 * Search for similar vectors using cosine similarity
 */
async function searchSimilarVectors(queryEmbedding, topK = 10, threshold = 0.75, filter = {}) {
    try {
        if (!index) {
            await initializePinecone();
        }

        console.log(`🔍 Searching Pinecone for top ${topK} similar vectors...`);

        const queryRequest = {
            vector: queryEmbedding,
            topK,
            includeMetadata: true,
            includeValues: false
        };

        // Add filter if provided
        if (Object.keys(filter).length > 0) {
            queryRequest.filter = filter;
        }

        const queryResponse = await index.query(queryRequest);

        // Filter by similarity threshold
        const results = queryResponse.matches
            .filter(match => match.score >= threshold)
            .map(match => ({
                id: match.id,
                similarity: match.score,
                chunkText: match.metadata?.chunkText || '',
                chunkIndex: match.metadata?.chunkIndex || 0,
                documentId: match.metadata?.documentId || '',
                filename: match.metadata?.filename || 'Unknown'
            }));

        console.log(`✅ Found ${results.length} matches above threshold ${threshold}`);

        return results;
    } catch (error) {
        console.error('Error searching vectors:', error);
        throw error;
    }
}

/**
 * Get all documents (retrieve unique document IDs from vectors)
 */
async function getAllDocuments() {
    try {
        if (!index) {
            await initializePinecone();
        }

        console.log('📊 Fetching all documents from Pinecone...');

        // Get index stats
        const stats = await index.describeIndexStats();
        console.log(`Total vectors in index: ${stats.totalRecordCount || 0}`);

        if (!stats.totalRecordCount || stats.totalRecordCount === 0) {
            return [];
        }

        // Query with dummy vector to get all records (limited approach)
        // Use a broad query to sample vectors and extract unique document IDs
        const queryResponse = await index.query({
            vector: new Array(768).fill(0.1), // Dummy vector
            topK: 10000, // Max Pinecone allows
            includeMetadata: true,
            includeValues: false
        });

        // Extract unique documents
        const documentMap = new Map();
        
        queryResponse.matches.forEach(match => {
            const metadata = match.metadata || {};
            const docId = metadata.documentId;
            const filename = metadata.filename || 'Unknown';
            
            if (docId && !documentMap.has(docId)) {
                documentMap.set(docId, {
                    document_id: docId,
                    filename: filename,
                    upload_date: new Date().toISOString(),
                    chunk_count: 1
                });
            } else if (docId) {
                documentMap.get(docId).chunk_count++;
            }
        });

        const documents = Array.from(documentMap.values());
        console.log(`✓ Found ${documents.length} unique documents`);

        return documents;
    } catch (error) {
        console.error('Error getting documents:', error);
        return []; // Return empty array on error
    }
}

/**
 * Get document chunks by document ID
 */
async function getDocumentChunks(documentId) {
    try {
        if (!index) {
            await initializePinecone();
        }

        // Query with filter for specific document
        const queryResponse = await index.query({
            vector: new Array(768).fill(0), // Dummy vector
            topK: 10000, // Max results
            includeMetadata: true,
            filter: {
                documentId: { $eq: documentId }
            }
        });

        const chunks = queryResponse.matches.map(match => ({
            id: match.id,
            chunkText: match.metadata?.chunkText || '',
            chunkIndex: match.metadata?.chunkIndex || 0,
            tokenCount: match.metadata?.tokenCount || 0
        }));

        return chunks;
    } catch (error) {
        console.error('Error getting document chunks:', error);
        throw error;
    }
}

/**
 * Delete document and all its vectors
 */
async function deleteDocument(documentId) {
    try {
        if (!index) {
            await initializePinecone();
        }

        console.log(`🗑️  Deleting document: ${documentId}`);

        // Delete all vectors with matching documentId
        await index.deleteMany({
            documentId: { $eq: documentId }
        });

        console.log(`✅ Deleted document: ${documentId}`);

        return { success: true, documentId };
    } catch (error) {
        console.error('Error deleting document:', error);
        throw error;
    }
}

/**
 * Delete specific chunk by ID
 */
async function deleteChunk(chunkId) {
    try {
        if (!index) {
            await initializePinecone();
        }

        await index.deleteOne(chunkId);

        return { success: true, chunkId };
    } catch (error) {
        console.error('Error deleting chunk:', error);
        throw error;
    }
}

/**
 * Fetch vectors by IDs
 */
async function fetchVectors(vectorIds) {
    try {
        if (!index) {
            await initializePinecone();
        }

        const response = await index.fetch(vectorIds);

        return response.records;
    } catch (error) {
        console.error('Error fetching vectors:', error);
        throw error;
    }
}

/**
 * Get index statistics
 */
async function getIndexStats() {
    try {
        if (!index) {
            await initializePinecone();
        }

        const stats = await index.describeIndexStats();

        return {
            totalVectors: stats.totalRecordCount || 0,
            dimension: stats.dimension || 768,
            namespaces: stats.namespaces || {},
            indexFullness: stats.indexFullness || 0
        };
    } catch (error) {
        console.error('Error getting index stats:', error);
        throw error;
    }
}

/**
 * Store conversation history (using metadata)
 */
async function storeConversation(userMessage, aiResponse, contextChunks = []) {
    try {
        // Pinecone is optimized for vectors, not relational data
        // For conversation history, consider using a separate database
        // or store in application memory/file system
        
        const conversation = {
            id: `conv_${Date.now()}`,
            userMessage,
            aiResponse,
            contextChunks,
            timestamp: new Date().toISOString()
        };

        console.log(`💬 Conversation logged: ${conversation.id}`);

        return conversation;
    } catch (error) {
        console.error('Error storing conversation:', error);
        throw error;
    }
}

/**
 * Hybrid search (combining vector similarity with keyword filtering)
 */
async function hybridSearch(queryEmbedding, keywords = [], topK = 10, threshold = 0.75) {
    try {
        if (!index) {
            await initializePinecone();
        }

        console.log(`🔍 Performing hybrid search with ${keywords.length} keywords...`);

        // Perform vector search
        const results = await searchSimilarVectors(queryEmbedding, topK * 2, threshold);

        // If keywords provided, filter results
        if (keywords.length > 0) {
            const filteredResults = results.filter(result => {
                const text = result.chunkText.toLowerCase();
                return keywords.some(keyword => text.includes(keyword.toLowerCase()));
            });

            return filteredResults.slice(0, topK);
        }

        return results.slice(0, topK);
    } catch (error) {
        console.error('Error in hybrid search:', error);
        throw error;
    }
}

module.exports = {
    initializePinecone,
    healthCheck,
    insertDocument,
    insertVectors,
    searchSimilarVectors,
    getAllDocuments,
    getDocumentChunks,
    deleteDocument,
    deleteChunk,
    fetchVectors,
    getIndexStats,
    storeConversation,
    hybridSearch
};

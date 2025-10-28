/**
 * Search Routes Module
 * Implements semantic search with vector similarity and hybrid ranking
 */

const express = require('express');
const router = express.Router();
const { searchSimilarVectors, hybridSearch } = require('../db/pinecone');
const { generateQueryEmbedding } = require('../nlp/embeddings');

/**
 * POST /api/search
 * Semantic search endpoint with vector similarity
 * 
 * Request body:
 * {
 *   query: string,
 *   topK: number (optional, default: 10),
 *   threshold: number (optional, default: 0.5),
 *   filters: object (optional)
 * }
 */
router.post('/', async (req, res) => {
    try {
        const { query, topK = 10, threshold = 0.5, filters = {} } = req.body;

        // Validate input
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid search query is required'
            });
        }

        if (topK < 1 || topK > 100) {
            return res.status(400).json({
                success: false,
                error: 'topK must be between 1 and 100'
            });
        }

        console.log(`\n🔍 Processing search query: "${query}"`);
        console.log(`Parameters: topK=${topK}, threshold=${threshold}`);

        const startTime = Date.now();

        // Generate query embedding
        console.log('Generating query embedding...');
        const queryEmbedding = await generateQueryEmbedding(query);
        console.log(`✓ Query embedding generated (${queryEmbedding.length} dimensions)`);

        // Perform vector search
        console.log('Searching vector database...');
        const results = await searchSimilarVectors(queryEmbedding, topK, threshold, filters);

        const duration = Date.now() - startTime;
        console.log(`✓ Found ${results.length} results in ${duration}ms`);

        // Format results for response
        const formattedResults = results.map((result, index) => ({
            rank: index + 1,
            documentId: result.documentId,
            documentName: result.filename || 'Unknown',
            chunkId: result.id,
            content: result.chunkText,
            similarity: parseFloat(result.similarity).toFixed(4),
            chunkIndex: result.chunkIndex
        }));

        res.json({
            success: true,
            query,
            resultsCount: formattedResults.length,
            results: formattedResults,
            executionTime: `${duration}ms`,
            parameters: { topK, threshold }
        });

    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed',
            message: error.message
        });
    }
});

/**
 * POST /api/search/hybrid
 * Hybrid search combining vector similarity and keyword matching
 * 
 * Request body:
 * {
 *   query: string,
 *   topK: number (optional, default: 10),
 *   vectorWeight: number (optional, default: 0.7),
 *   keywordWeight: number (optional, default: 0.3)
 * }
 */
router.post('/hybrid', async (req, res) => {
    try {
        const {
            query,
            topK = 10,
            vectorWeight = 0.7,
            keywordWeight = 0.3,
            filters = {}
        } = req.body;

        // Validate input
        if (!query || typeof query !== 'string' || query.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid search query is required'
            });
        }

        if (vectorWeight + keywordWeight !== 1.0) {
            return res.status(400).json({
                success: false,
                error: 'vectorWeight + keywordWeight must equal 1.0'
            });
        }

        console.log(`\n🔍 Processing hybrid search: "${query}"`);
        console.log(`Weights: vector=${vectorWeight}, keyword=${keywordWeight}`);

        const startTime = Date.now();

        // Generate query embedding
        const queryEmbedding = await generateQueryEmbedding(query);

        // Perform hybrid search
        const results = await hybridSearch(query, queryEmbedding, {
            topK,
            vectorWeight,
            keywordWeight,
            filters
        });

        const duration = Date.now() - startTime;
        console.log(`✓ Found ${results.length} hybrid results in ${duration}ms`);

        // Format results
        const formattedResults = results.map((result, index) => ({
            rank: index + 1,
            documentId: result.document_id,
            documentName: result.document_name,
            chunkId: result.chunk_id,
            content: result.content,
            hybridScore: parseFloat(result.hybrid_score).toFixed(4),
            vectorScore: parseFloat(result.vector_score).toFixed(4),
            keywordScore: parseFloat(result.keyword_score).toFixed(4),
            metadata: result.metadata || {}
        }));

        res.json({
            success: true,
            query,
            searchType: 'hybrid',
            resultsCount: formattedResults.length,
            results: formattedResults,
            executionTime: `${duration}ms`,
            parameters: { topK, vectorWeight, keywordWeight }
        });

    } catch (error) {
        console.error('Hybrid search error:', error);
        res.status(500).json({
            success: false,
            error: 'Hybrid search failed',
            message: error.message
        });
    }
});

/**
 * POST /api/search/similar
 * Find similar chunks to a given chunk ID
 * 
 * Request body:
 * {
 *   chunkId: string,
 *   topK: number (optional, default: 5),
 *   excludeSameDocument: boolean (optional, default: true)
 * }
 */
router.post('/similar', async (req, res) => {
    try {
        const { chunkId, topK = 5, excludeSameDocument = true } = req.body;

        if (!chunkId) {
            return res.status(400).json({
                success: false,
                error: 'chunkId is required'
            });
        }

        console.log(`\n🔍 Finding similar chunks to: ${chunkId}`);

        const startTime = Date.now();

        // Get the source chunk's embedding
        const { getChunkById } = require('../db/pgvector');
        const sourceChunk = await getChunkById(chunkId);

        if (!sourceChunk) {
            return res.status(404).json({
                success: false,
                error: 'Source chunk not found'
            });
        }

        // Search for similar chunks
        const filters = excludeSameDocument ? {
            excludeDocumentId: sourceChunk.document_id
        } : {};

        const results = await searchDocuments(sourceChunk.embedding, {
            topK: topK + 1, // +1 to account for the source chunk itself
            threshold: 0.3,
            filters
        });

        // Remove the source chunk from results
        const similarChunks = results.filter(r => r.chunk_id !== chunkId).slice(0, topK);

        const duration = Date.now() - startTime;
        console.log(`✓ Found ${similarChunks.length} similar chunks in ${duration}ms`);

        res.json({
            success: true,
            sourceChunk: {
                chunkId: sourceChunk.chunk_id,
                documentName: sourceChunk.document_name,
                content: sourceChunk.content.substring(0, 200) + '...'
            },
            similarChunks: similarChunks.map((chunk, index) => ({
                rank: index + 1,
                chunkId: chunk.chunk_id,
                documentName: chunk.document_name,
                content: chunk.content,
                similarity: parseFloat(chunk.similarity).toFixed(4)
            })),
            executionTime: `${duration}ms`
        });

    } catch (error) {
        console.error('Similar chunks search error:', error);
        res.status(500).json({
            success: false,
            error: 'Similar chunks search failed',
            message: error.message
        });
    }
});

/**
 * POST /api/search/document
 * Search within a specific document
 * 
 * Request body:
 * {
 *   query: string,
 *   documentId: string,
 *   topK: number (optional, default: 10)
 * }
 */
router.post('/document', async (req, res) => {
    try {
        const { query, documentId, topK = 10 } = req.body;

        if (!query || !documentId) {
            return res.status(400).json({
                success: false,
                error: 'query and documentId are required'
            });
        }

        console.log(`\n🔍 Searching within document: ${documentId}`);

        const startTime = Date.now();

        // Generate query embedding
        const queryEmbedding = await generateQueryEmbedding(query);

        // Search with document filter
        const results = await searchDocuments(queryEmbedding, {
            topK,
            threshold: 0.3,
            filters: { documentId }
        });

        const duration = Date.now() - startTime;

        res.json({
            success: true,
            query,
            documentId,
            resultsCount: results.length,
            results: results.map((r, i) => ({
                rank: i + 1,
                chunkId: r.chunk_id,
                content: r.content,
                similarity: parseFloat(r.similarity).toFixed(4),
                metadata: r.metadata
            })),
            executionTime: `${duration}ms`
        });

    } catch (error) {
        console.error('Document search error:', error);
        res.status(500).json({
            success: false,
            error: 'Document search failed',
            message: error.message
        });
    }
});

/**
 * GET /api/search/suggestions
 * Get search suggestions based on query prefix
 * 
 * Query params:
 * ?q=query_prefix&limit=5
 */
router.get('/suggestions', async (req, res) => {
    try {
        const { q, limit = 5 } = req.query;

        if (!q || q.length < 2) {
            return res.json({
                success: true,
                suggestions: []
            });
        }

        // Get recent successful queries from database
        const { getSearchSuggestions } = require('../db/pgvector');
        const suggestions = await getSearchSuggestions(q, limit);

        res.json({
            success: true,
            suggestions
        });

    } catch (error) {
        console.error('Suggestions error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get suggestions',
            message: error.message
        });
    }
});

module.exports = router;
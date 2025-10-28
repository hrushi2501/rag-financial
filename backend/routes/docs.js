/**
 * Document Management Routes
 * CRUD operations for uploaded documents and chunks
 */

const express = require('express');
const router = express.Router();
const {
    getAllDocuments,
    getDocumentChunks,
    deleteDocument,
    deleteChunk,
    getIndexStats
} = require('../db/pinecone');

/**
 * GET /api/docs
 * List all uploaded documents
 * 
 * Query params:
 * ?limit=10&offset=0&sortBy=upload_date&order=desc
 */
router.get('/', async (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            sortBy = 'upload_date',
            order = 'desc'
        } = req.query;

        console.log(`\n📚 Fetching documents (limit: ${limit}, offset: ${offset})`);

        const documents = await getAllDocuments();

        console.log(`✓ Retrieved ${documents.length} documents`);

        // Format documents for frontend compatibility
        const documentsWithStats = documents.map((doc) => {
            return {
                document_id: doc.document_id,
                filename: doc.filename,
                file_type: doc.filename.split('.').pop() || 'unknown',
                file_size: 0, // Not stored in Pinecone metadata
                upload_date: doc.upload_date,
                total_chunks: doc.chunk_count || 0,
                stats: {
                    chunks: doc.chunk_count || 0,
                    uploadDate: doc.upload_date
                }
            };
        });

        res.json({
            success: true,
            count: documentsWithStats.length,
            documents: documentsWithStats,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch documents',
            message: error.message
        });
    }
});

/**
 * GET /api/docs/:documentId
 * Get single document with all chunks
 */
router.get('/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const { includeChunks = 'true' } = req.query;

        console.log(`\n📄 Fetching document: ${documentId}`);

        const document = await getDocumentById(documentId);

        if (!document) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        let chunks = [];
        if (includeChunks === 'true') {
            chunks = await getDocumentChunks(documentId);
            console.log(`✓ Retrieved ${chunks.length} chunks`);
        }

        const stats = await getDocumentStats(documentId);

        res.json({
            success: true,
            document: {
                ...document,
                stats,
                chunks: includeChunks === 'true' ? chunks : undefined
            }
        });

    } catch (error) {
        console.error('Error fetching document:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch document',
            message: error.message
        });
    }
});

/**
 * GET /api/docs/:documentId/chunks
 * Get all chunks for a document
 * 
 * Query params:
 * ?limit=50&offset=0
 */
router.get('/:documentId/chunks', async (req, res) => {
    try {
        const { documentId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        console.log(`\n📄 Fetching chunks for document: ${documentId}`);

        const chunks = await getDocumentChunks(documentId, {
            limit: parseInt(limit),
            offset: parseInt(offset)
        });

        res.json({
            success: true,
            documentId,
            count: chunks.length,
            chunks: chunks.map(chunk => ({
                chunkId: chunk.chunk_id,
                content: chunk.content,
                chunkIndex: chunk.chunk_index,
                metadata: chunk.metadata,
                createdAt: chunk.created_at
            })),
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });

    } catch (error) {
        console.error('Error fetching chunks:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chunks',
            message: error.message
        });
    }
});

/**
 * GET /api/docs/chunk/:chunkId
 * Get single chunk by ID
 */
router.get('/chunk/:chunkId', async (req, res) => {
    try {
        const { chunkId } = req.params;

        console.log(`\n📄 Fetching chunk: ${chunkId}`);

        const chunk = await getChunkById(chunkId);

        if (!chunk) {
            return res.status(404).json({
                success: false,
                error: 'Chunk not found'
            });
        }

        res.json({
            success: true,
            chunk
        });

    } catch (error) {
        console.error('Error fetching chunk:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch chunk',
            message: error.message
        });
    }
});

/**
 * DELETE /api/docs/:documentId
 * Delete document and all associated chunks
 */
router.delete('/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;

        console.log(`\n🗑️ Deleting document: ${documentId}`);

        const result = await deleteDocument(documentId);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        console.log(`✓ Deleted document and ${result.chunksDeleted} chunks`);

        res.json({
            success: true,
            message: 'Document deleted successfully',
            documentId,
            chunksDeleted: result.chunksDeleted
        });

    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete document',
            message: error.message
        });
    }
});

/**
 * DELETE /api/docs/chunk/:chunkId
 * Delete single chunk
 */
router.delete('/chunk/:chunkId', async (req, res) => {
    try {
        const { chunkId } = req.params;

        console.log(`\n🗑️ Deleting chunk: ${chunkId}`);

        const result = await deleteChunk(chunkId);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: 'Chunk not found'
            });
        }

        res.json({
            success: true,
            message: 'Chunk deleted successfully',
            chunkId
        });

    } catch (error) {
        console.error('Error deleting chunk:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete chunk',
            message: error.message
        });
    }
});

/**
 * PATCH /api/docs/:documentId
 * Update document metadata
 * 
 * Request body:
 * {
 *   metadata: object
 * }
 */
router.patch('/:documentId', async (req, res) => {
    try {
        const { documentId } = req.params;
        const { metadata } = req.body;

        if (!metadata || typeof metadata !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Valid metadata object is required'
            });
        }

        console.log(`\n✏️ Updating document metadata: ${documentId}`);

        const result = await updateDocumentMetadata(documentId, metadata);

        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        res.json({
            success: true,
            message: 'Document metadata updated',
            document: result.document
        });

    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update document',
            message: error.message
        });
    }
});

/**
 * GET /api/docs/:documentId/stats
 * Get detailed statistics for a document
 */
router.get('/:documentId/stats', async (req, res) => {
    try {
        const { documentId } = req.params;

        console.log(`\n📊 Fetching stats for document: ${documentId}`);

        const stats = await getDocumentStats(documentId);

        if (!stats) {
            return res.status(404).json({
                success: false,
                error: 'Document not found'
            });
        }

        res.json({
            success: true,
            documentId,
            stats
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch statistics',
            message: error.message
        });
    }
});

/**
 * GET /api/docs/stats/overview
 * Get system-wide statistics
 */
router.get('/stats/overview', async (req, res) => {
    try {
        console.log('\n📊 Fetching system overview...');

        const { getSystemStats } = require('../db/pgvector');
        const stats = await getSystemStats();

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        console.error('Error fetching overview:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch system statistics',
            message: error.message
        });
    }
});

module.exports = router;
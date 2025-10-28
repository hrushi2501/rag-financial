/**
 * Embedding Generation Module
 * Generates vector embeddings using Google Gemini API with caching and retry logic
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LRUCache } = require('lru-cache');
require('dotenv').config();

// Initialize Gemini API client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-004';

// Initialize LRU cache for embeddings (max 1000 entries, max age 1 hour)
const embeddingCache = new LRUCache({
    max: 1000,
    ttl: 1000 * 60 * 60, // 1 hour
    updateAgeOnGet: true
});

// Rate limiting configuration
const RATE_LIMIT = {
    requestsPerMinute: 60,
    requestQueue: [],
    lastRequestTime: 0
};

/**
 * Generate hash for cache key
 * 
 * @param {string} text - Text to hash
 * @returns {string} Hash string
 */
function generateCacheKey(text) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Wait for rate limit compliance
 * Implements simple rate limiting to avoid API throttling
 */
async function waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
    const minInterval = (60 * 1000) / RATE_LIMIT.requestsPerMinute;

    if (timeSinceLastRequest < minInterval) {
        const waitTime = minInterval - timeSinceLastRequest;
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    RATE_LIMIT.lastRequestTime = Date.now();
}

/**
 * Generate embedding for a single text with exponential backoff retry
 * 
 * @param {string} text - Text to embed
 * @param {Object} options - Generation options
 * @returns {Promise<Array<number>>} Embedding vector
 */
async function generateEmbedding(text, options = {}) {
    const {
        useCache = true,
        maxRetries = parseInt(process.env.API_RETRY_ATTEMPTS) || 3,
        timeout = parseInt(process.env.API_TIMEOUT) || 30000
    } = options;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid text input for embedding generation');
    }

    // Check cache first
    const cacheKey = generateCacheKey(text);
    if (useCache && embeddingCache.has(cacheKey)) {
        console.log('✓ Retrieved embedding from cache');
        return embeddingCache.get(cacheKey);
    }

    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Wait for rate limit
            await waitForRateLimit();

            // Generate embedding with timeout
            const model = genAI.getGenerativeModel({ model: embeddingModel });

            const embeddingPromise = model.embedContent(text);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Embedding generation timeout')), timeout)
            );

            const result = await Promise.race([embeddingPromise, timeoutPromise]);

            if (!result || !result.embedding || !result.embedding.values) {
                throw new Error('Invalid embedding response from API');
            }

            const embedding = result.embedding.values;

            // Validate embedding dimensions
            const expectedDimensions = parseInt(process.env.VECTOR_DIMENSIONS) || 768;
            if (embedding.length !== expectedDimensions) {
                throw new Error(`Embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`);
            }

            // Cache the result
            if (useCache) {
                embeddingCache.set(cacheKey, embedding);
            }

            return embedding;

        } catch (error) {
            lastError = error;
            console.error(`Embedding generation attempt ${attempt + 1} failed:`, error.message);

            // Exponential backoff: 1s, 2s, 4s, etc.
            if (attempt < maxRetries - 1) {
                const backoffTime = Math.pow(2, attempt) * 1000;
                console.log(`Retrying in ${backoffTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }
    }

    throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${lastError.message}`);
}

/**
 * Generate embeddings for multiple texts in batch with progress tracking
 * 
 * @param {Array<string>} texts - Array of texts to embed
 * @param {Function} progressCallback - Optional callback for progress updates
 * @returns {Promise<Array<Array<number>>>} Array of embedding vectors
 */
async function generateBatchEmbeddings(texts, progressCallback = null) {
    if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Invalid texts array for batch embedding');
    }

    console.log(`Generating embeddings for ${texts.length} texts...`);

    const embeddings = [];
    const batchSize = 10; // Process in smaller batches to avoid overwhelming API

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
        const batchPromises = batch.map(text => generateEmbedding(text));

        try {
            const batchResults = await Promise.all(batchPromises);
            embeddings.push(...batchResults);

            // Progress callback
            if (progressCallback && typeof progressCallback === 'function') {
                const progress = Math.min(((i + batch.length) / texts.length) * 100, 100);
                progressCallback(progress, i + batch.length, texts.length);
            }

            console.log(`✓ Processed ${Math.min(i + batchSize, texts.length)}/${texts.length} embeddings`);

        } catch (error) {
            console.error(`Error processing batch ${i / batchSize + 1}:`, error);
            throw error;
        }
    }

    return embeddings;
}

/**
 * Calculate cosine similarity between two vectors
 * Used for validating embedding quality and similarity checks
 * 
 * @param {Array<number>} vec1 - First vector
 * @param {Array<number>} vec2 - Second vector
 * @returns {number} Cosine similarity score (0 to 1)
 */
function cosineSimilarity(vec1, vec2) {
    if (!Array.isArray(vec1) || !Array.isArray(vec2)) {
        throw new Error('Invalid vectors for similarity calculation');
    }

    if (vec1.length !== vec2.length) {
        throw new Error('Vectors must have same dimensions');
    }

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }

    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);

    if (norm1 === 0 || norm2 === 0) {
        return 0;
    }

    return dotProduct / (norm1 * norm2);
}

/**
 * Normalize embedding vector (ensure unit length)
 * Some vector databases require normalized vectors
 * 
 * @param {Array<number>} embedding - Vector to normalize
 * @returns {Array<number>} Normalized vector
 */
function normalizeEmbedding(embedding) {
    if (!Array.isArray(embedding)) {
        throw new Error('Invalid embedding for normalization');
    }

    const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude === 0) {
        return embedding;
    }

    return embedding.map(val => val / magnitude);
}

/**
 * Validate embedding vector
 * Ensures embedding meets quality standards
 * 
 * @param {Array<number>} embedding - Embedding to validate
 * @returns {Object} Validation result
 */
function validateEmbedding(embedding) {
    const validation = {
        isValid: true,
        errors: [],
        warnings: []
    };

    if (!Array.isArray(embedding)) {
        validation.isValid = false;
        validation.errors.push('Embedding is not an array');
        return validation;
    }

    const expectedDimensions = parseInt(process.env.VECTOR_DIMENSIONS) || 768;
    if (embedding.length !== expectedDimensions) {
        validation.isValid = false;
        validation.errors.push(`Expected ${expectedDimensions} dimensions, got ${embedding.length}`);
    }

    // Check for NaN or infinite values
    const hasInvalidValues = embedding.some(val =>
        !isFinite(val) || isNaN(val)
    );

    if (hasInvalidValues) {
        validation.isValid = false;
        validation.errors.push('Embedding contains NaN or infinite values');
    }

    // Check if vector is all zeros (suspicious)
    const isAllZeros = embedding.every(val => val === 0);
    if (isAllZeros) {
        validation.warnings.push('Embedding vector is all zeros');
    }

    // Check magnitude (should be close to 1 for normalized vectors)
    const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude < 0.1 || magnitude > 10) {
        validation.warnings.push(`Unusual vector magnitude: ${magnitude.toFixed(4)}`);
    }

    return validation;
}

/**
 * Get cache statistics
 * 
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
    return {
        size: embeddingCache.size,
        maxSize: embeddingCache.max,
        hits: embeddingCache.calculatedSize || 0,
        hitRate: embeddingCache.size > 0 ?
            ((embeddingCache.calculatedSize || 0) / embeddingCache.size * 100).toFixed(2) + '%' : '0%'
    };
}

/**
 * Clear embedding cache
 */
function clearCache() {
    embeddingCache.clear();
    console.log('✓ Embedding cache cleared');
}

/**
 * Generate query embedding optimized for search
 * Uses the same model but with optional query-specific preprocessing
 * 
 * @param {string} query - Search query
 * @returns {Promise<Array<number>>} Query embedding
 */
async function generateQueryEmbedding(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Invalid query for embedding generation');
    }

    // Preprocess query (lowercase, trim)
    const processedQuery = query.toLowerCase().trim();

    // Generate embedding with caching enabled
    return await generateEmbedding(processedQuery, { useCache: true });
}

/**
 * Batch process with error handling and partial results
 * Continues processing even if some texts fail
 * 
 * @param {Array<string>} texts - Texts to embed
 * @param {Function} progressCallback - Progress callback
 * @returns {Promise<Object>} Results with embeddings and errors
 */
async function generateBatchWithErrorHandling(texts, progressCallback = null) {
    if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Invalid texts array');
    }

    const results = {
        embeddings: [],
        errors: [],
        successCount: 0,
        failureCount: 0
    };

    for (let i = 0; i < texts.length; i++) {
        try {
            const embedding = await generateEmbedding(texts[i]);
            results.embeddings.push(embedding);
            results.successCount++;

            if (progressCallback) {
                progressCallback((i + 1) / texts.length * 100, i + 1, texts.length);
            }

        } catch (error) {
            console.error(`Failed to generate embedding for text ${i}:`, error.message);
            results.embeddings.push(null);
            results.errors.push({ index: i, error: error.message });
            results.failureCount++;
        }
    }

    return results;
}

/**
 * Test embedding generation with sample text
 * Useful for validating API connection and model configuration
 * 
 * @returns {Promise<Object>} Test results
 */
async function testEmbeddingGeneration() {
    const testText = "Financial revenue increased by 15% in Q4 2024.";

    console.log('Testing embedding generation...');
    const startTime = Date.now();

    try {
        const embedding = await generateEmbedding(testText, { useCache: false });
        const duration = Date.now() - startTime;

        const validation = validateEmbedding(embedding);

        return {
            success: true,
            duration: `${duration}ms`,
            dimensions: embedding.length,
            sampleValues: embedding.slice(0, 5),
            validation
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Export functions
module.exports = {
    generateEmbedding,
    generateBatchEmbeddings,
    generateBatchWithErrorHandling,
    generateQueryEmbedding,
    cosineSimilarity,
    normalizeEmbedding,
    validateEmbedding,
    getCacheStats,
    clearCache,
    testEmbeddingGeneration
};
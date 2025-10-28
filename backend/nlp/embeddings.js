// Embeddings via Gemini with simple cache + retry

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LRUCache } = require('lru-cache');
require('dotenv').config();

// Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const embeddingModel = process.env.EMBEDDING_MODEL || 'text-embedding-004';

// LRU cache (max 1000, 1h)
const embeddingCache = new LRUCache({
    max: 1000,
    ttl: 1000 * 60 * 60, // 1 hour
    updateAgeOnGet: true
});

// Simple rate limit
const RATE_LIMIT = {
    requestsPerMinute: 60,
    requestQueue: [],
    lastRequestTime: 0
};

// Cache key
function generateCacheKey(text) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(text).digest('hex');
}

// Wait for rate limit
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

// One embedding with retry
async function generateEmbedding(text, options = {}) {
    const {
        useCache = true,
        maxRetries = parseInt(process.env.API_RETRY_ATTEMPTS) || 3,
        timeout = parseInt(process.env.API_TIMEOUT) || 30000
    } = options;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Invalid text input for embedding generation');
    }

    // Cache first
    const cacheKey = generateCacheKey(text);
    if (useCache && embeddingCache.has(cacheKey)) {
        console.log('Embedding from cache');
        return embeddingCache.get(cacheKey);
    }

    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Rate limit
            await waitForRateLimit();

            // Generate with timeout
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

            // Validate dimensions
            const expectedDimensions = parseInt(process.env.VECTOR_DIMENSIONS) || 768;
            if (embedding.length !== expectedDimensions) {
                throw new Error(`Embedding dimension mismatch: expected ${expectedDimensions}, got ${embedding.length}`);
            }

            // Cache
            if (useCache) {
                embeddingCache.set(cacheKey, embedding);
            }

            return embedding;

        } catch (error) {
            lastError = error;
            console.error(`Embedding attempt ${attempt + 1} failed:`, error.message);

            // Exponential backoff: 1s, 2s, 4s, etc.
            if (attempt < maxRetries - 1) {
                const backoffTime = Math.pow(2, attempt) * 1000;
                console.log(`Retry in ${backoffTime}ms`);
                await new Promise(resolve => setTimeout(resolve, backoffTime));
            }
        }
    }

    throw new Error(`Failed to generate embedding after ${maxRetries} attempts: ${lastError.message}`);
}

// Batch embeddings with optional progress
async function generateBatchEmbeddings(texts, progressCallback = null) {
    if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Invalid texts array for batch embedding');
    }

    console.log(`Batch size: ${texts.length}`);

    const embeddings = [];
    const batchSize = 10; // Process in smaller batches to avoid overwhelming API

    for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
        const batchPromises = batch.map(text => generateEmbedding(text));

        try {
            const batchResults = await Promise.all(batchPromises);
            embeddings.push(...batchResults);

            // Progress
            if (progressCallback && typeof progressCallback === 'function') {
                const progress = Math.min(((i + batch.length) / texts.length) * 100, 100);
                progressCallback(progress, i + batch.length, texts.length);
            }
            console.log(`Processed ${Math.min(i + batchSize, texts.length)}/${texts.length}`);

        } catch (error) {
            console.error(`Error processing batch ${i / batchSize + 1}:`, error);
            throw error;
        }
    }

    return embeddings;
}

// Cosine similarity
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

// Normalize to unit length
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

// Validate embedding vector
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

    // NaN/Inf
    const hasInvalidValues = embedding.some(val =>
        !isFinite(val) || isNaN(val)
    );

    if (hasInvalidValues) {
        validation.isValid = false;
        validation.errors.push('Embedding contains NaN or infinite values');
    }

    // All zeros
    const isAllZeros = embedding.every(val => val === 0);
    if (isAllZeros) {
        validation.warnings.push('Embedding vector is all zeros');
    }

    // Magnitude sanity
    const magnitude = Math.sqrt(
        embedding.reduce((sum, val) => sum + val * val, 0)
    );

    if (magnitude < 0.1 || magnitude > 10) {
        validation.warnings.push(`Unusual vector magnitude: ${magnitude.toFixed(4)}`);
    }

    return validation;
}

// Cache stats
function getCacheStats() {
    return {
        size: embeddingCache.size,
        maxSize: embeddingCache.max,
        hits: embeddingCache.calculatedSize || 0,
        hitRate: embeddingCache.size > 0 ?
            ((embeddingCache.calculatedSize || 0) / embeddingCache.size * 100).toFixed(2) + '%' : '0%'
    };
}

// Clear cache
function clearCache() {
    embeddingCache.clear();
    console.log('Embedding cache cleared');
}

// Generate query embedding
async function generateQueryEmbedding(query) {
    if (!query || typeof query !== 'string') {
        throw new Error('Invalid query for embedding generation');
    }

    // Simple preprocess
    const processedQuery = query.toLowerCase().trim();

    // Generate embedding with caching enabled
    return await generateEmbedding(processedQuery, { useCache: true });
}

// Batch with partial failure reporting
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
            console.error(`Failed embedding for index ${i}:`, error.message);
            results.embeddings.push(null);
            results.errors.push({ index: i, error: error.message });
            results.failureCount++;
        }
    }

    return results;
}

// Quick self-test
async function testEmbeddingGeneration() {
    const testText = "Financial revenue increased by 15% in Q4 2024.";

    console.log('Embedding self-test...');
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
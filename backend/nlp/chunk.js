// Chunking: split text into overlapping chunks, preserving sentences when possible

const { encoding_for_model } = require('tiktoken');
const { tokenizeSentences } = require('./preprocess');

// Initialize tiktoken encoder for accurate token counting
let encoder;
try {
    encoder = encoding_for_model('gpt-3.5-turbo'); // Compatible with most models
} catch (error) {
    console.warn('Tiktoken not available, using approximate token counting');
    encoder = null;
}

/**
 * Count tokens in text accurately using tiktoken
 * Falls back to word-based approximation if tiktoken unavailable
 * 
 * @param {string} text - Text to count tokens
 * @returns {number} Token count
 */
function countTokens(text) {
    if (!text || typeof text !== 'string') {
        return 0;
    }

    try {
        if (encoder) {
            const tokens = encoder.encode(text);
            return tokens.length;
        } else {
            // Approximation: ~1.3 tokens per word
            const words = text.split(/\s+/).filter(w => w.length > 0);
            return Math.ceil(words.length * 1.3);
        }
    } catch (error) {
        console.error('Error counting tokens:', error);
        // Fallback approximation
        return Math.ceil(text.length / 4);
    }
}

/**
 * Split text into chunks with overlap while preserving sentence boundaries
 * 
 * @param {string} text - Text to chunk
 * @param {Object} options - Chunking options
 * @returns {Array<Object>} Array of chunk objects with metadata
 */
function chunkText(text, options = {}) {
    const {
        chunkSize = parseInt(process.env.CHUNK_SIZE) || 500,
        overlap = parseInt(process.env.CHUNK_OVERLAP) || 50,
        preserveSentences = true
    } = options;

    // Validate input
    if (!text || typeof text !== 'string') {
        console.warn('chunkText: Invalid input - text is not a string');
        return [];
    }

    const trimmedText = text.trim();
    if (trimmedText.length === 0) {
        console.warn('chunkText: Empty text provided');
        return [];
    }

    // If text is very short, return as single chunk
    if (trimmedText.length < 100) {
        console.log('chunkText: Text is short, creating single chunk');
        return createSingleChunk(trimmedText, 0);
    }

    const chunks = [];

    try {
        if (preserveSentences) {
            // Split by sentences for better semantic coherence
            const sentences = tokenizeSentences(trimmedText);

            if (sentences.length === 0) {
                // No sentences detected, treat entire text as one chunk
                console.log('chunkText: No sentences detected, creating single chunk');
                return createSingleChunk(trimmedText, 0);
            }

            let currentChunk = '';
            let currentTokenCount = 0;
            let chunkIndex = 0;
            let startPosition = 0;
            let sentenceBuffer = []; // For overlap

            for (let i = 0; i < sentences.length; i++) {
                const sentence = sentences[i];
                const sentenceTokens = countTokens(sentence);

                // Check if adding this sentence exceeds chunk size
                if (currentTokenCount + sentenceTokens > chunkSize && currentChunk.length > 0) {
                    // Save current chunk
                    chunks.push({
                        text: currentChunk.trim(),
                        metadata: {
                            chunkIndex,
                            startPosition,
                            endPosition: startPosition + currentChunk.length,
                            tokenCount: currentTokenCount,
                            sentenceCount: sentenceBuffer.length
                        }
                    });

                    // Create overlap from last few sentences
                    const overlapSentences = getOverlapSentences(sentenceBuffer, overlap);
                currentChunk = overlapSentences.join(' ') + ' ';
                currentTokenCount = countTokens(currentChunk);
                startPosition += currentChunk.length;

                chunkIndex++;
                sentenceBuffer = overlapSentences.slice();
            }

            // Add sentence to current chunk
            currentChunk += sentence + ' ';
            currentTokenCount += sentenceTokens;
            sentenceBuffer.push(sentence);
        }

        // Add final chunk if there's remaining text
        if (currentChunk.trim().length > 0) {
            chunks.push({
                text: currentChunk.trim(),
                metadata: {
                    chunkIndex,
                    startPosition,
                    endPosition: startPosition + currentChunk.length,
                    tokenCount: currentTokenCount,
                    sentenceCount: sentenceBuffer.length
                }
            });
        }

        } else {
            // Token-based chunking without sentence preservation
            chunks.push(...tokenBasedChunking(trimmedText, chunkSize, overlap));
        }

        // Ensure we have at least one chunk
        if (chunks.length === 0 && trimmedText.length > 0) {
            console.log('chunkText: No chunks created, creating single chunk as fallback');
            return createSingleChunk(trimmedText, 0);
        }

    } catch (error) {
        console.error('Error in chunkText:', error);
        // Fallback: return entire text as single chunk
        return createSingleChunk(trimmedText, 0);
    }

    return chunks;
}

/**
 * Get sentences for overlap based on token count
 * 
 * @param {Array<string>} sentences - Array of sentences
 * @param {number} targetOverlapTokens - Target overlap in tokens
 * @returns {Array<string>} Sentences for overlap
 */
function getOverlapSentences(sentences, targetOverlapTokens) {
    const overlapSentences = [];
    let tokenCount = 0;

    // Take sentences from the end until we reach target overlap
    for (let i = sentences.length - 1; i >= 0; i--) {
        const sentence = sentences[i];
        const sentenceTokens = countTokens(sentence);

        if (tokenCount + sentenceTokens > targetOverlapTokens) {
            break;
        }

        overlapSentences.unshift(sentence);
        tokenCount += sentenceTokens;
    }

    return overlapSentences;
}

/**
 * Create a single chunk from entire text (for short documents)
 * 
 * @param {string} text - Text content
 * @param {number} index - Chunk index
 * @returns {Array<Object>} Single chunk array
 */
function createSingleChunk(text, index = 0) {
    return [{
        text: text.trim(),
        metadata: {
            chunkIndex: index,
            startPosition: 0,
            endPosition: text.length,
            tokenCount: countTokens(text),
            sentenceCount: tokenizeSentences(text).length || 1
        }
    }];
}

/**
 * Token-based chunking (fallback when sentence preservation is disabled)
 * 
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Size per chunk in tokens
 * @param {number} overlap - Overlap in tokens
 * @returns {Array<Object>} Array of chunks
 */
function tokenBasedChunking(text, chunkSize, overlap) {
    const chunks = [];
    const words = text.split(/\s+/);

    let currentChunk = [];
    let chunkIndex = 0;
    let position = 0;

    for (let i = 0; i < words.length; i++) {
        currentChunk.push(words[i]);
        const chunkText = currentChunk.join(' ');
        const tokenCount = countTokens(chunkText);

        if (tokenCount >= chunkSize) {
            chunks.push({
                text: chunkText,
                metadata: {
                    chunkIndex,
                    startPosition: position,
                    endPosition: position + chunkText.length,
                    tokenCount
                }
            });

            // Create overlap
            const overlapWords = Math.ceil(overlap / 1.3); // Approximate words from tokens
            currentChunk = currentChunk.slice(-overlapWords);
            position += chunkText.length;
            chunkIndex++;
        }
    }

    // Add remaining text
    if (currentChunk.length > 0) {
        const chunkText = currentChunk.join(' ');
        chunks.push({
            text: chunkText,
            metadata: {
                chunkIndex,
                startPosition: position,
                endPosition: position + chunkText.length,
                tokenCount: countTokens(chunkText)
            }
        });
    }

    return chunks;
}

/**
 * Chunk text by paragraphs (useful for structured documents)
 * 
 * @param {string} text - Text to chunk
 * @param {number} maxTokens - Maximum tokens per chunk
 * @returns {Array<Object>} Array of paragraph-based chunks
 */
function chunkByParagraphs(text, maxTokens = 500) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    const chunks = [];

    let currentChunk = '';
    let chunkIndex = 0;
    let startPosition = 0;

    for (const paragraph of paragraphs) {
        const combinedText = currentChunk + '\n\n' + paragraph;
        const tokenCount = countTokens(combinedText);

        if (tokenCount > maxTokens && currentChunk.length > 0) {
            // Save current chunk
            chunks.push({
                text: currentChunk.trim(),
                metadata: {
                    chunkIndex,
                    startPosition,
                    endPosition: startPosition + currentChunk.length,
                    tokenCount: countTokens(currentChunk),
                    type: 'paragraph'
                }
            });

            currentChunk = paragraph;
            startPosition += currentChunk.length;
            chunkIndex++;
        } else {
            currentChunk = combinedText.trim();
        }
    }

    // Add final chunk
    if (currentChunk.length > 0) {
        chunks.push({
            text: currentChunk,
            metadata: {
                chunkIndex,
                startPosition,
                endPosition: startPosition + currentChunk.length,
                tokenCount: countTokens(currentChunk),
                type: 'paragraph'
            }
        });
    }

    return chunks;
}

/**
 * Validate chunk quality
 * Ensures chunks meet minimum quality standards
 * 
 * @param {Object} chunk - Chunk to validate
 * @returns {boolean} Whether chunk is valid
 */
function validateChunk(chunk) {
    if (!chunk || !chunk.text || !chunk.metadata) {
        return false;
    }

    const { text, metadata } = chunk;

    // Minimum length check (at least 20 characters)
    if (text.trim().length < 20) {
        return false;
    }

    // Token count check
    if (metadata.tokenCount < 10) {
        return false;
    }

    // Check for mostly whitespace or special characters
    const alphanumericRatio = (text.match(/[a-zA-Z0-9]/g) || []).length / text.length;
    if (alphanumericRatio < 0.5) {
        return false;
    }

    return true;
}

/**
 * Get chunking statistics
 * 
 * @param {Array<Object>} chunks - Array of chunks
 * @returns {Object} Statistics about chunks
 */
function getChunkingStats(chunks) {
    if (!Array.isArray(chunks) || chunks.length === 0) {
        return null;
    }

    const tokenCounts = chunks.map(c => c.metadata.tokenCount);
    const textLengths = chunks.map(c => c.text.length);

    return {
        totalChunks: chunks.length,
        avgTokensPerChunk: (tokenCounts.reduce((a, b) => a + b, 0) / chunks.length).toFixed(2),
        minTokens: Math.min(...tokenCounts),
        maxTokens: Math.max(...tokenCounts),
        avgCharsPerChunk: (textLengths.reduce((a, b) => a + b, 0) / chunks.length).toFixed(2),
        totalTokens: tokenCounts.reduce((a, b) => a + b, 0)
    };
}

// Export functions
module.exports = {
    chunkText,
    chunkByParagraphs,
    countTokens,
    validateChunk,
    getChunkingStats
};
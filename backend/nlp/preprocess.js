/**
 * Text Preprocessing Module
 * Handles text cleaning, normalization, tokenization, and stopword removal
 */

const natural = require('natural');
const tokenizer = new natural.WordTokenizer();
const sentenceTokenizer = new natural.SentenceTokenizer();

// Financial-specific terms to preserve (don't remove as stopwords)
const FINANCIAL_TERMS = new Set([
    'revenue', 'profit', 'loss', 'earnings', 'debt', 'equity', 'roi',
    'ebitda', 'assets', 'liabilities', 'cash', 'flow', 'margin',
    'growth', 'dividend', 'stock', 'bond', 'investment', 'valuation'
]);

// Standard English stopwords (from natural library)
const stopwords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'this', 'but', 'they', 'have', 'had',
    'what', 'when', 'where', 'who', 'which', 'why', 'how'
]);

/**
 * Clean and normalize text
 * - Remove special characters (except financial symbols)
 * - Normalize whitespace
 * - Normalize Unicode characters
 * - Convert to lowercase
 * 
 * @param {string} text - Raw text to clean
 * @returns {string} Cleaned text
 */
function cleanText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    try {
        // Normalize Unicode characters (e.g., smart quotes to regular quotes)
        text = text.normalize('NFKD');

        // Preserve financial symbols and percentages
        text = text.replace(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/g, 'DOLLAR$1');
        text = text.replace(/(\d+(?:\.\d+)?)\%/g, '$1PERCENT');

        // Remove URLs
        text = text.replace(/https?:\/\/[^\s]+/g, '');

        // Remove email addresses
        text = text.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '');

        // Remove special characters but keep alphanumeric, spaces, and basic punctuation
        text = text.replace(/[^\w\s\.\,\!\?\-\'\"\(\)]/g, ' ');

        // Restore financial symbols
        text = text.replace(/DOLLAR(\d+)/g, '$$$1');
        text = text.replace(/(\d+)PERCENT/g, '$1%');

        // Normalize whitespace (multiple spaces to single space)
        text = text.replace(/\s+/g, ' ');

        // Remove leading/trailing whitespace
        text = text.trim();

        // Convert to lowercase for consistency (except for acronyms)
        text = text.toLowerCase();

        return text;

    } catch (error) {
        console.error('Error cleaning text:', error);
        return text;
    }
}

/**
 * Tokenize text into sentences
 * Preserves sentence boundaries for better context
 * 
 * @param {string} text - Text to tokenize
 * @returns {Array<string>} Array of sentences
 */
function tokenizeSentences(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    try {
        // Use natural's sentence tokenizer
        const sentences = sentenceTokenizer.tokenize(text);

        // Filter out very short sentences (likely noise)
        return sentences.filter(sentence =>
            sentence.trim().length > 10 && sentence.split(/\s+/).length > 2
        );

    } catch (error) {
        console.error('Error tokenizing sentences:', error);
        return [text];
    }
}

/**
 * Tokenize text into words
 * 
 * @param {string} text - Text to tokenize
 * @returns {Array<string>} Array of word tokens
 */
function tokenizeWords(text) {
    if (!text || typeof text !== 'string') {
        return [];
    }

    try {
        // Use natural's word tokenizer
        const tokens = tokenizer.tokenize(text.toLowerCase());

        // Filter out single characters and numbers-only tokens (unless financial)
        return tokens.filter(token =>
            token.length > 1 || /^\d+$/.test(token)
        );

    } catch (error) {
        console.error('Error tokenizing words:', error);
        return text.split(/\s+/);
    }
}

/**
 * Remove stopwords from token array
 * Preserves financial terms and important context words
 * 
 * @param {Array<string>} tokens - Array of word tokens
 * @returns {Array<string>} Filtered tokens
 */
function removeStopwords(tokens) {
    if (!Array.isArray(tokens)) {
        return [];
    }

    return tokens.filter(token => {
        const lowerToken = token.toLowerCase();

        // Keep if it's a financial term
        if (FINANCIAL_TERMS.has(lowerToken)) {
            return true;
        }

        // Keep if it's a number or contains digits
        if (/\d/.test(token)) {
            return true;
        }

        // Remove if it's a common stopword
        return !stopwords.has(lowerToken);
    });
}

/**
 * Apply Porter stemming to reduce words to root form
 * Optional - useful for search but may lose semantic meaning
 * 
 * @param {string} text - Text to stem
 * @returns {string} Stemmed text
 */
function stemText(text) {
    if (!text || typeof text !== 'string') {
        return '';
    }

    try {
        const tokens = tokenizeWords(text);
        const stemmedTokens = tokens.map(token =>
            natural.PorterStemmer.stem(token)
        );

        return stemmedTokens.join(' ');

    } catch (error) {
        console.error('Error stemming text:', error);
        return text;
    }
}

/**
 * Extract financial entities from text
 * Identifies monetary values, percentages, and dates
 * 
 * @param {string} text - Text to analyze
 * @returns {Object} Extracted entities
 */
function extractFinancialEntities(text) {
    const entities = {
        monetary: [],
        percentages: [],
        dates: [],
        numbers: []
    };

    if (!text || typeof text !== 'string') {
        return entities;
    }

    // Extract monetary values
    const moneyRegex = /\$\d+(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:million|billion|trillion|k|m|b))?/gi;
    entities.monetary = text.match(moneyRegex) || [];

    // Extract percentages
    const percentRegex = /\d+(?:\.\d+)?%/g;
    entities.percentages = text.match(percentRegex) || [];

    // Extract dates (simple patterns)
    const dateRegex = /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi;
    entities.dates = text.match(dateRegex) || [];

    // Extract standalone numbers (could be metrics)
    const numberRegex = /\b\d+(?:,\d{3})*(?:\.\d+)?\b/g;
    entities.numbers = text.match(numberRegex) || [];

    return entities;
}

/**
 * Full preprocessing pipeline
 * Combines all preprocessing steps in sequence
 * 
 * @param {string} text - Raw text to preprocess
 * @param {Object} options - Processing options
 * @returns {Object} Processed text and metadata
 */
function preprocessText(text, options = {}) {
    const {
        applyStemming = false,
        removeStops = true,
        extractEntities = true,
        preserveCase = false
    } = options;

    if (!text || typeof text !== 'string') {
        return {
            cleanedText: '',
            sentences: [],
            tokens: [],
            entities: {},
            metadata: { originalLength: 0, processedLength: 0 }
        };
    }

    const originalLength = text.length;

    // Step 1: Clean text
    let processedText = cleanText(text);

    // Step 2: Extract entities before further processing
    const entities = extractEntities ? extractFinancialEntities(text) : {};

    // Step 3: Tokenize into sentences
    const sentences = tokenizeSentences(processedText);

    // Step 4: Tokenize into words
    let tokens = tokenizeWords(processedText);

    // Step 5: Remove stopwords (optional)
    if (removeStops) {
        tokens = removeStopwords(tokens);
    }

    // Step 6: Apply stemming (optional)
    if (applyStemming) {
        processedText = stemText(processedText);
    }

    // Step 7: Preserve original case if requested
    if (preserveCase) {
        processedText = text.replace(/[^\w\s\.\,\!\?\-\'\"]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    return {
        cleanedText: processedText,
        sentences,
        tokens,
        entities,
        metadata: {
            originalLength,
            processedLength: processedText.length,
            sentenceCount: sentences.length,
            tokenCount: tokens.length,
            reductionRatio: ((originalLength - processedText.length) / originalLength * 100).toFixed(2) + '%'
        }
    };
}

/**
 * Validate and sanitize text input
 * Ensures text is safe for processing
 * 
 * @param {string} text - Text to validate
 * @returns {boolean} Whether text is valid
 */
function validateText(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    // Check minimum length
    if (text.trim().length < 10) {
        return false;
    }

    // Check for suspicious patterns (potential injections)
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /eval\(/i,
        /expression\(/i
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(text)) {
            console.warn('Suspicious pattern detected in text');
            return false;
        }
    }

    return true;
}

/**
 * Calculate text statistics
 * Useful for determining optimal chunking strategy
 * 
 * @param {string} text - Text to analyze
 * @returns {Object} Text statistics
 */
function getTextStats(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const words = tokenizeWords(text);
    const sentences = tokenizeSentences(text);

    return {
        characterCount: text.length,
        wordCount: words.length,
        sentenceCount: sentences.length,
        avgWordLength: (text.replace(/\s/g, '').length / words.length).toFixed(2),
        avgSentenceLength: (words.length / sentences.length).toFixed(2),
        uniqueWords: new Set(words.map(w => w.toLowerCase())).size,
        lexicalDiversity: (new Set(words.map(w => w.toLowerCase())).size / words.length).toFixed(3)
    };
}

// Export all functions
module.exports = {
    cleanText,
    tokenizeSentences,
    tokenizeWords,
    removeStopwords,
    stemText,
    extractFinancialEntities,
    preprocessText,
    validateText,
    getTextStats,
    FINANCIAL_TERMS
};
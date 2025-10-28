// frontend/js/nlp.js

/**
 * Minimal NLP utils for frontend.
 * Offers preview cleaning, tokenizing, and chunking before upload.
 * Intended mainly for instant UI feedback or file preview before POST.
 */

// Clean text - remove excess whitespace, normalize Unicode, strip HTML tags
function cleanText(text) {
  if (!text) return '';
  let cleaned = text.replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
    .replace(/<[^>]*>?/gm, '')   // remove html tags
    .replace(/[^\x00-\x7F]+/g, '') // non-ascii
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

// Tokenize - naive whitespace split for previews/prompt
function tokenize(text) {
  if (!text) return [];
  return text.split(/\s+/);
}

// Simple chunking - splits by number of tokens (client-side only, fallback for preview)
function chunkText(text, tokensPerChunk = 500, overlap = 50) {
  const tokens = tokenize(cleanText(text));
  const chunks = [];
  for (let i = 0; i < tokens.length; i += (tokensPerChunk - overlap)) {
    const chunk = tokens.slice(i, i + tokensPerChunk).join(' ');
    chunks.push({
      text: chunk,
      start: i,
      end: i + tokensPerChunk,
      tokenCount: chunk.split(/\s+/).length
    });
  }
  return chunks;
}

// Stopword removal (English only, static list)
const EN_STOPWORDS = new Set([
  "the","and","a","an","is","in","it","of","to","for","on","with","as","at","by","from","that","this","or","be","are"
]);
function removeStopwords(tokens) {
  return tokens.filter(token => !EN_STOPWORDS.has(token.toLowerCase()));
}

// Preview usage hooks
export { cleanText, tokenize, chunkText, removeStopwords };

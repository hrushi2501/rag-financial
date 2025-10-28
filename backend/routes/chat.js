/**
 * Chat Routes Module
 * RAG-based chat completion with context retrieval and conversation history
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { searchSimilarVectors } = require('../db/pinecone');
const { generateQueryEmbedding } = require('../nlp/embeddings');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const chatModel = process.env.CHAT_MODEL || 'gemini-2.5-flash';

// In-memory conversation history (consider Redis for production)
const conversationHistory = new Map();

/**
 * POST /api/chat
 * Chat completion with RAG context
 * 
 * Request body:
 * {
 *   message: string,
 *   conversationId: string (optional),
 *   topK: number (optional, default: 5),
 *   includeContext: boolean (optional, default: true),
 *   temperature: number (optional, default: 0.7)
 * }
 */
router.post('/', async (req, res) => {
    try {
        const {
            message,
            conversationId = null,
            topK = 5,
            includeContext = true,
            temperature = 0.7,
            filters = {}
        } = req.body;

        // Validate input
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid message is required'
            });
        }

        console.log(`\n💬 Processing chat message: "${message}"`);
        console.log(`Conversation ID: ${conversationId || 'new'}`);

        const startTime = Date.now();
        let contextChunks = [];

        // Retrieve context from vector database if enabled
        if (includeContext) {
            console.log('Retrieving context from documents...');
            const queryEmbedding = await generateQueryEmbedding(message);

            // Lowered threshold to 0.3 to improve recall; precision is handled by prompt grounding
            contextChunks = await searchSimilarVectors(queryEmbedding, topK, 0.3, filters);

            console.log(`✓ Retrieved ${contextChunks.length} context chunks`);
        } else {
            console.log('⚠ Context retrieval disabled for this message');
        }

        // Build conversation history
        let conversationContext = [];
        if (conversationId && conversationHistory.has(conversationId)) {
            conversationContext = conversationHistory.get(conversationId);
            console.log(`Using conversation history (${conversationContext.length} messages)`);
        }

        // Construct prompt with context
        const systemPrompt = buildSystemPrompt(contextChunks);
        const userPrompt = message;

        // Generate response using Gemini with retry logic
        console.log('Generating AI response...');
        const model = genAI.getGenerativeModel({
            model: chatModel,
            generationConfig: {
                temperature,
                maxOutputTokens: 2048,
            }
        });

        // Build chat history for Gemini
        const chatHistory = conversationContext.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const chat = model.startChat({
            history: chatHistory,
            generationConfig: {
                temperature,
                maxOutputTokens: 2048,
            },
        });

        // Add system context to the message
        const messageWithContext = includeContext && contextChunks.length > 0
            ? `${systemPrompt}\n\nUser question: ${userPrompt}`
            : userPrompt;

        // Retry logic for 503 errors
        let result;
        let response;
        let retries = 3;
        
        while (retries > 0) {
            try {
                result = await chat.sendMessage(messageWithContext);
                response = result.response.text();
                break; // Success, exit retry loop
            } catch (error) {
                retries--;
                if (error.status === 503 && retries > 0) {
                    console.log(`⚠ Model overloaded, retrying... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                } else {
                    throw error; // Re-throw if not 503 or out of retries
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`✓ Response generated in ${duration}ms`);

        // Update conversation history
        const newConversationId = conversationId || generateConversationId();
        if (!conversationHistory.has(newConversationId)) {
            conversationHistory.set(newConversationId, []);
        }

        const history = conversationHistory.get(newConversationId);
        history.push({ role: 'user', content: message, timestamp: new Date() });
        history.push({ role: 'assistant', content: response, timestamp: new Date() });

        // Keep only last 10 messages
        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }

        // Prepare context citations
        const citations = contextChunks.map((chunk, index) => ({
            index: index + 1,
            documentName: chunk.filename || 'Unknown',
            chunkId: chunk.id,
            similarity: parseFloat(chunk.similarity).toFixed(4),
            snippet: (chunk.chunkText || '').substring(0, 150) + '...'
        }));

        res.json({
            success: true,
            response,
            conversationId: newConversationId,
            contextUsed: includeContext,
            contextChunksCount: contextChunks.length,
            citations,
            executionTime: `${duration}ms`,
            metadata: {
                model: chatModel,
                temperature
            }
        });

    } catch (error) {
        console.error('Chat error:', error);
        
            // Handle specific error types
            const isOverloaded = error.status === 503;
            const isRateLimited = error.status === 429;
        
            res.status(500).json({
                success: false,
                error: isOverloaded 
                    ? 'AI model is temporarily overloaded. Please try again in a moment.'
                    : isRateLimited
                    ? 'Rate limit exceeded. Please wait a moment before trying again.'
                    : 'Chat completion failed',
                message: error.message,
                retryable: isOverloaded || isRateLimited
            });
    }
});

/**
 * POST /api/chat/stream
 * Streaming chat completion with RAG context
 * 
 * Request body: Same as /api/chat
 */
router.post('/stream', async (req, res) => {
    try {
        const {
            message,
            conversationId = null,
            topK = 5,
            includeContext = true,
            temperature = 0.7,
            filters = {}
        } = req.body;

        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid message is required'
            });
        }

        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        console.log(`\n💬 Processing streaming chat: "${message}"`);

        // Retrieve context
        let contextChunks = [];
        if (includeContext) {
            const queryEmbedding = await generateQueryEmbedding(message);
            // Lowered threshold to 0.3 to improve recall for streaming as well
            contextChunks = await searchSimilarVectors(queryEmbedding, topK, 0.3, filters);
        }

        // Send context event
        if (contextChunks.length > 0) {
            res.write(`data: ${JSON.stringify({
                type: 'context',
                chunks: contextChunks.map(c => ({
                    documentName: c.filename || 'Unknown',
                    similarity: parseFloat(c.similarity).toFixed(4)
                }))
            })}\n\n`);
        }

        // Build conversation context
        let conversationContext = [];
        if (conversationId && conversationHistory.has(conversationId)) {
            conversationContext = conversationHistory.get(conversationId);
        }

        // Generate streaming response
        const systemPrompt = buildSystemPrompt(contextChunks);
        const model = genAI.getGenerativeModel({ model: chatModel });

        const chatHistory = conversationContext.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
        }));

        const chat = model.startChat({ history: chatHistory });

        const messageWithContext = includeContext && contextChunks.length > 0
            ? `${systemPrompt}\n\nUser question: ${message}`
            : message;

        const result = await chat.sendMessageStream(messageWithContext);

        let fullResponse = '';

        // Stream chunks
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;

            res.write(`data: ${JSON.stringify({
                type: 'chunk',
                content: chunkText
            })}\n\n`);
        }

        // Send completion event
        res.write(`data: ${JSON.stringify({
            type: 'done',
            fullResponse
        })}\n\n`);

        res.end();

        // Update conversation history
        const newConversationId = conversationId || generateConversationId();
        if (!conversationHistory.has(newConversationId)) {
            conversationHistory.set(newConversationId, []);
        }

        const history = conversationHistory.get(newConversationId);
        history.push({ role: 'user', content: message, timestamp: new Date() });
        history.push({ role: 'assistant', content: fullResponse, timestamp: new Date() });

        if (history.length > 10) {
            history.splice(0, history.length - 10);
        }

    } catch (error) {
        console.error('Streaming chat error:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message
        })}\n\n`);
        res.end();
    }
});

/**
 * GET /api/chat/history/:conversationId
 * Get conversation history
 */
router.get('/history/:conversationId', (req, res) => {
    try {
        const { conversationId } = req.params;

        if (!conversationHistory.has(conversationId)) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found'
            });
        }

        const history = conversationHistory.get(conversationId);

        res.json({
            success: true,
            conversationId,
            messageCount: history.length,
            messages: history
        });

    } catch (error) {
        console.error('History retrieval error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve history',
            message: error.message
        });
    }
});

/**
 * DELETE /api/chat/history/:conversationId
 * Clear conversation history
 */
router.delete('/history/:conversationId', (req, res) => {
    try {
        const { conversationId } = req.params;

        if (conversationHistory.has(conversationId)) {
            conversationHistory.delete(conversationId);
            console.log(`✓ Cleared conversation: ${conversationId}`);
        }

        res.json({
            success: true,
            message: 'Conversation history cleared'
        });

    } catch (error) {
        console.error('History deletion error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear history',
            message: error.message
        });
    }
});

/**
 * POST /api/chat/summarize
 * Summarize a document or conversation
 * 
 * Request body:
 * {
 *   text: string,
 *   maxLength: number (optional, default: 200)
 * }
 */
router.post('/summarize', async (req, res) => {
    try {
        const { text, maxLength = 200 } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }

        console.log(`\n📝 Generating summary (max ${maxLength} words)...`);

        const model = genAI.getGenerativeModel({ model: chatModel });

        const prompt = `Summarize the following text in approximately ${maxLength} words. Focus on key financial metrics, important dates, and main conclusions:\n\n${text}`;

        const result = await model.generateContent(prompt);
        const summary = result.response.text();

        res.json({
            success: true,
            summary,
            originalLength: text.length,
            summaryLength: summary.length
        });

    } catch (error) {
        console.error('Summarization error:', error);
        res.status(500).json({
            success: false,
            error: 'Summarization failed',
            message: error.message
        });
    }
});

/**
 * Build system prompt with context chunks
 */
function buildSystemPrompt(contextChunks) {
    if (!contextChunks || contextChunks.length === 0) {
        return `You are a helpful financial document assistant. Answer questions accurately and concisely.`;
    }

    const contextText = contextChunks
        .map((chunk, index) => `[${index + 1}] ${chunk.chunkText || chunk.content}`)
        .join('\n\n');

    return `You are a helpful financial document assistant. Use the following context to answer the user's question. If the context doesn't contain relevant information, say so and provide a general answer if possible.

Context from documents:
${contextText}

Instructions:
- Answer based primarily on the provided context
- Cite which context chunk(s) you used (e.g., "According to context [1]...")
- Be specific about financial figures, dates, and metrics
- If uncertain, acknowledge limitations
- Keep answers concise but complete`;
}

/**
 * Generate unique conversation ID
 */
function generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clean up old conversations (run periodically)
 */
function cleanupOldConversations() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [id, history] of conversationHistory.entries()) {
        if (history.length === 0) continue;

        const lastMessage = history[history.length - 1];
        const age = now - lastMessage.timestamp.getTime();

        if (age > maxAge) {
            conversationHistory.delete(id);
            console.log(`Cleaned up old conversation: ${id}`);
        }
    }
}

// Run cleanup every hour
setInterval(cleanupOldConversations, 60 * 60 * 1000);

module.exports = router;
// Chat endpoints: RAG retrieval + lightweight history

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

// In-memory history (swap to Redis for prod)
const conversationHistory = new Map();

// POST /api/chat — non-streaming
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

    console.log(`Chat: "${message}" (conv=${conversationId || 'new'})`);

        const startTime = Date.now();
        let contextChunks = [];

        // Retrieve context
        if (includeContext) {
            console.log('Retrieving context...');
            const queryEmbedding = await generateQueryEmbedding(message);
            // Lower threshold (0.3) for better recall
            contextChunks = await searchSimilarVectors(queryEmbedding, topK, 0.3, filters);
            console.log(`Context chunks: ${contextChunks.length}`);
        } else {
            console.log('Context disabled');
        }

        // Build conversation history
        let conversationContext = [];
        if (conversationId && conversationHistory.has(conversationId)) {
            conversationContext = conversationHistory.get(conversationId);
            console.log(`Using conversation history (${conversationContext.length} messages)`);
        }

    // Prompt
        const systemPrompt = buildSystemPrompt(contextChunks);
        const userPrompt = message;

        // Generate response using Gemini with retry logic
    console.log('Generating response...');
        const model = genAI.getGenerativeModel({
            model: chatModel,
            generationConfig: {
                temperature,
                maxOutputTokens: 2048,
            }
        });

        // Gemini history
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

        // Add context
        const messageWithContext = includeContext && contextChunks.length > 0
            ? `${systemPrompt}\n\nUser question: ${userPrompt}`
            : userPrompt;

        // Retry on 503/429
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
                if ((error.status === 503 || error.status === 429) && retries > 0) {
                    console.log(`Retrying... (${retries} left)`);
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                } else {
                    throw error; // Re-throw if not 503 or out of retries
                }
            }
        }

        const duration = Date.now() - startTime;
        console.log(`Done in ${duration}ms`);

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

        // Citations
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
        
            // Classify error
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

// POST /api/chat/stream — SSE streaming
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

    // SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

    console.log(`Streaming chat: "${message}"`);

        // Retrieve context
        let contextChunks = [];
        if (includeContext) {
            const queryEmbedding = await generateQueryEmbedding(message);
            // Threshold 0.3 for recall
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

        // Conversation context
        let conversationContext = [];
        if (conversationId && conversationHistory.has(conversationId)) {
            conversationContext = conversationHistory.get(conversationId);
        }

    // Stream response
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

        // Done
        res.write(`data: ${JSON.stringify({
            type: 'done',
            fullResponse
        })}\n\n`);

        res.end();

        // Save history
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

// GET /api/chat/history/:conversationId — fetch history
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

// DELETE /api/chat/history/:conversationId — clear history
router.delete('/history/:conversationId', (req, res) => {
    try {
        const { conversationId } = req.params;

        if (conversationHistory.has(conversationId)) {
            conversationHistory.delete(conversationId);
            console.log(`Cleared conversation: ${conversationId}`);
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

// POST /api/chat/summarize — quick summary
router.post('/summarize', async (req, res) => {
    try {
        const { text, maxLength = 200 } = req.body;

        if (!text) {
            return res.status(400).json({
                success: false,
                error: 'Text is required'
            });
        }

    console.log(`Summarize (max ${maxLength} words)`);

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

// Build system prompt from context
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

// ID helper
function generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Cleanup old conversations hourly
function cleanupOldConversations() {
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();

    for (const [id, history] of conversationHistory.entries()) {
        if (history.length === 0) continue;

        const lastMessage = history[history.length - 1];
        const age = now - lastMessage.timestamp.getTime();

        if (age > maxAge) {
            conversationHistory.delete(id);
            console.log(`Cleaned old conversation: ${id}`);
        }
    }
}

// Hourly cleanup
setInterval(cleanupOldConversations, 60 * 60 * 1000);

module.exports = router;
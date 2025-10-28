// Upload routes: extract, chunk, embed, store

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { parse } = require('csv-parse/sync');

// Import NLP pipeline modules
const { cleanText, tokenizeSentences } = require('../nlp/preprocess');
const { chunkText } = require('../nlp/chunk');
const { generateBatchEmbeddings } = require('../nlp/embeddings');
const { insertDocument, insertVectors } = require('../db/pinecone');
const { extractDocxImagesText, OCR_ENABLED } = require('../nlp/ocr');

// Multer storage
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const uploadDir = process.env.UPLOAD_DIR || './uploads';
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 // 10MB default
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'pdf,docx,txt,csv').split(',');
        const ext = path.extname(file.originalname).toLowerCase().replace('.', '');

        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`File type .${ext} not allowed. Supported types: ${allowedTypes.join(', ')}`));
        }
    }
});

// PDF -> text
async function extractPDF(filePath) {
    try {
        const dataBuffer = await fs.readFile(filePath);
        const data = await pdfParse(dataBuffer);
        return data.text;
    } catch (error) {
        console.error('PDF extraction error:', error);
        throw new Error('Failed to extract text from PDF');
    }
}

// DOCX -> text (+optional OCR)
async function extractDOCX(filePath) {
    try {
        const result = await mammoth.extractRawText({ path: filePath });
        let text = result.value || '';

        // Optional OCR of embedded images
        if (OCR_ENABLED) {
            const ocrText = await extractDocxImagesText(filePath);
            if (ocrText && ocrText.length > 0) {
                text += `\n\n[OCR Extracted]\n${ocrText}`;
            }
        }

        return text;
    } catch (error) {
        console.error('DOCX extraction error:', error);
        throw new Error('Failed to extract text from DOCX');
    }
}

// TXT -> text
async function extractTXT(filePath) {
    try {
        const text = await fs.readFile(filePath, 'utf-8');
        return text;
    } catch (error) {
        console.error('TXT extraction error:', error);
        throw new Error('Failed to read text file');
    }
}

// CSV -> pseudo-text
async function extractCSV(filePath) {
    try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const records = parse(fileContent, {
            columns: true,
            skip_empty_lines: true
        });

        // Convert CSV records to text
        const text = records.map(record =>
            Object.entries(record)
                .map(([key, value]) => `${key}: ${value}`)
                .join(', ')
        ).join('\n');

        return text;
    } catch (error) {
        console.error('CSV extraction error:', error);
        throw new Error('Failed to extract text from CSV');
    }
}

// Dispatch by file type
async function extractText(filePath, fileType) {
    console.log(`Extracting ${fileType}...`);

    switch (fileType.toLowerCase()) {
        case 'pdf':
            return await extractPDF(filePath);
        case 'docx':
        case 'doc':
            return await extractDOCX(filePath);
        case 'txt':
            return await extractTXT(filePath);
        case 'csv':
            return await extractCSV(filePath);
        default:
            throw new Error(`Unsupported file type: ${fileType}`);
    }
}

// POST /api/upload — file
router.post('/', upload.single('file'), async (req, res) => {
    let documentId = null;
    let filePath = null;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded'
            });
        }

        const file = req.file;
        filePath = file.path;
        const fileType = path.extname(file.originalname).toLowerCase().replace('.', '');

    console.log(`Upload: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(2)} MB, ${fileType})`);

        const startTime = Date.now();

    // 1) Extract
        const rawText = await extractText(filePath, fileType);
    console.log(`Extracted ${rawText.length} chars`);

        if (rawText.length === 0) {
            throw new Error('No text content found in document');
        }

    // 2) Preprocess
        const cleanedText = cleanText(rawText);
        const sentences = tokenizeSentences(cleanedText);
    console.log(`Preprocessed: ${cleanedText.length} chars, ${sentences.length} sentences`);

        // 3) Chunk
        const chunks = chunkText(cleanedText, {
            chunkSize: parseInt(process.env.CHUNK_SIZE) || 500,
            overlap: parseInt(process.env.CHUNK_OVERLAP) || 50,
            preserveSentences: true
        });
        console.log(`Chunks: ${chunks.length}`);

        if (chunks.length === 0) {
            throw new Error('Failed to create text chunks');
        }

    // 4) Embeddings
        const texts = chunks.map(chunk => chunk.text);

        let processedCount = 0;
        const embeddings = await generateBatchEmbeddings(texts, (progress, current, total) => {
            if (current > processedCount) {
                processedCount = current;
                console.log(`Progress: ${current}/${total} (${progress.toFixed(1)}%)`);
            }
        });
        console.log(`Embeddings: ${embeddings.length}`);

    // 5) Store

        // Insert document metadata (returns string ID)
        documentId = await insertDocument(
            file.originalname,
            fileType,
            {
                fileSize: file.size,
                characterCount: rawText.length,
                chunkCount: chunks.length,
                processingTime: Date.now() - startTime
            }
        );

    console.log(`Document ID: ${documentId}`);

        // Insert vectors with filename
        const vectorCount = await insertVectors(documentId, file.originalname, chunks, embeddings);
    console.log(`Vectors inserted: ${vectorCount}`);

        // Delete temporary file
        await fs.unlink(filePath).catch(err =>
            console.warn('Failed to delete temporary file:', err.message)
        );

        const totalTime = Date.now() - startTime;
    console.log(`Done in ${(totalTime / 1000).toFixed(2)}s`);

        res.json({
            success: true,
            message: 'Document uploaded and processed successfully',
            document: {
                id: documentId,
                filename: file.originalname,
                fileType: fileType,
                fileSize: file.size,
                chunksProcessed: chunks.length,
                processingTime: `${(totalTime / 1000).toFixed(2)}s`
            }
        });

    } catch (error) {
    console.error('Upload error:', error);

        // Rollback: Delete document if it was created
        if (documentId) {
            try {
                const { deleteDocument } = require('../db/pgvector');
                await deleteDocument(documentId);
                console.log('Rolled back document creation');
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
            }
        }

        // Clean up file
        if (filePath) {
            await fs.unlink(filePath).catch(() => { });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to process document',
            message: error.message
        });
    }
});

// POST /api/upload/text — raw text
router.post('/text', async (req, res) => {
    let documentId = null;

    try {
        const { text, filename = 'raw-text.txt' } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Valid text content is required'
            });
        }

    console.log(`Raw text (${text.length} chars)`);

        const startTime = Date.now();

        // Preprocess
        const cleanedText = cleanText(text);
        const sentences = tokenizeSentences(cleanedText);
    console.log(`Preprocessed: ${sentences.length} sentences`);

        // Chunk
        const chunks = chunkText(cleanedText, {
            chunkSize: parseInt(process.env.CHUNK_SIZE) || 500,
            overlap: parseInt(process.env.CHUNK_OVERLAP) || 50
        });
    console.log(`Chunks: ${chunks.length}`);

        // Generate embeddings
        const texts = chunks.map(chunk => chunk.text);
        const embeddings = await generateBatchEmbeddings(texts);
    console.log(`Embeddings: ${embeddings.length}`);

        // Save to database
        documentId = await insertDocument({
            filename: filename,
            fileType: 'txt',
            fileSize: text.length,
            metadata: {
                source: 'raw_text',
                characterCount: text.length,
                chunkCount: chunks.length
            }
        });

        await insertVectors(documentId, chunks, embeddings);

        const totalTime = Date.now() - startTime;

        res.json({
            success: true,
            message: 'Text processed successfully',
            document: {
                id: documentId,
                filename: filename,
                chunksProcessed: chunks.length,
                processingTime: `${(totalTime / 1000).toFixed(2)}s`
            }
        });

    } catch (error) {
        console.error('Text processing error:', error);

        // Rollback if needed
        if (documentId) {
            try {
                const { deleteDocument } = require('../db/pgvector');
                await deleteDocument(documentId);
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError);
            }
        }

        res.status(500).json({
            success: false,
            error: 'Failed to process text',
            message: error.message
        });
    }
});

module.exports = router;

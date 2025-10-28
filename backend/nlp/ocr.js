/**
 * OCR Utilities
 * - Tesseract-based OCR for images and DOCX-embedded images
 * - Optional and controlled by env OCR_ENABLED
 */

const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const Tesseract = require('tesseract.js');
const mammoth = require('mammoth');

const OCR_ENABLED = (process.env.OCR_ENABLED || 'true').toLowerCase() === 'true';
const OCR_LANGUAGE = process.env.OCR_LANGUAGE || 'eng';

async function ocrImage(imagePath) {
    if (!OCR_ENABLED) return '';
    try {
        const { data } = await Tesseract.recognize(imagePath, OCR_LANGUAGE);
        return (data && data.text) ? data.text : '';
    } catch (err) {
        console.warn('OCR image failed:', err.message);
        return '';
    }
}

// Extract images from DOCX and OCR them; returns concatenated text
async function extractDocxImagesText(docxPath) {
    if (!OCR_ENABLED) return '';
    const tempDir = path.join(path.dirname(docxPath), `docx_images_${uuidv4()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const savedImages = [];
    try {
        await mammoth.convertToHtml({ path: docxPath }, {
            convertImage: mammoth.images.imgElement(async (image) => {
                try {
                    const buffer = await image.read('base64');
                    const contentType = image.contentType || 'image/png';
                    const ext = (contentType.split('/')[1] || 'png').split(';')[0];
                    const filename = `img_${uuidv4()}.${ext}`;
                    const outPath = path.join(tempDir, filename);
                    await fs.writeFile(outPath, Buffer.from(buffer, 'base64'));
                    savedImages.push(outPath);
                    return { src: '' };
                } catch (e) {
                    console.warn('Failed to save DOCX image for OCR:', e.message);
                    return { src: '' };
                }
            })
        });

        let ocrText = '';
        for (const img of savedImages) {
            const text = await ocrImage(img);
            if (text && text.trim().length > 0) {
                ocrText += '\n' + text.trim();
            }
        }
        return ocrText.trim();
    } catch (err) {
        console.warn('DOCX image OCR failed:', err.message);
        return '';
    } finally {
        // Cleanup images
        try {
            for (const img of savedImages) {
                await fs.unlink(img).catch(() => { });
            }
            await fs.rmdir(tempDir).catch(() => { });
        } catch { }
    }
}

module.exports = {
    ocrImage,
    extractDocxImagesText,
    OCR_ENABLED,
};

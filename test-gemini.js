/**
 * Quick test to verify Gemini API configuration
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testGemini() {
    console.log('Testing Gemini API...\n');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Test different model names
    const modelsToTest = [
        'gemini-1.5-flash',
        'gemini-1.5-pro',
        'gemini-pro',
        'models/gemini-1.5-flash',
        'models/gemini-pro'
    ];
    
    for (const modelName of modelsToTest) {
        try {
            console.log(`Testing model: ${modelName}`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent('Say hello');
            const text = result.response.text();
            console.log(`✅ SUCCESS with ${modelName}`);
            console.log(`Response: ${text.substring(0, 50)}...\n`);
            
            // If we found a working model, stop testing
            console.log(`\n🎯 Use this model in your .env: CHAT_MODEL=${modelName}`);
            break;
        } catch (error) {
            console.log(`❌ FAILED with ${modelName}`);
            console.log(`Error: ${error.message}\n`);
        }
    }
}

testGemini().catch(console.error);

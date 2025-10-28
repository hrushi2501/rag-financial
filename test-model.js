/**
 * Test the updated Gemini model
 */
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function testModel() {
    console.log('Testing Gemini 2.5 Flash...\n');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    
    try {
        const result = await model.generateContent('Say hello in one sentence');
        const text = result.response.text();
        console.log('✅ SUCCESS!');
        console.log('Model: gemini-2.5-flash');
        console.log(`Response: ${text}\n`);
        
        // Test chat mode
        const chat = model.startChat({
            history: [],
        });
        
        const chatResult = await chat.sendMessage('What is 2+2?');
        const chatText = chatResult.response.text();
        console.log('✅ Chat mode also works!');
        console.log(`Response: ${chatText}\n`);
        
        console.log('🎉 Your chat endpoint should now work!');
        console.log('Restart your server and try again.');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testModel();

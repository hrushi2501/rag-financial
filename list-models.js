/**
 * List available Gemini models for your API key
 */
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;

async function listModels() {
    try {
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        console.log('\n📋 Available Gemini Models:\n');
        
        // Filter only generative models (not embeddings)
        const generativeModels = data.models.filter(m => 
            m.supportedGenerationMethods && 
            m.supportedGenerationMethods.includes('generateContent')
        );
        
        console.log('🤖 Text Generation Models:');
        generativeModels.forEach(model => {
            console.log(`  - ${model.name}`);
        });
        
        console.log('\n🎯 Recommended models for chat:');
        const recommended = generativeModels.filter(m => 
            m.name.includes('flash') || m.name.includes('pro')
        ).slice(0, 5);
        
        recommended.forEach(model => {
            const shortName = model.name.replace('models/', '');
            console.log(`  ✓ ${shortName}`);
        });
        
        console.log('\n💡 Update your .env file with one of these:');
        if (recommended.length > 0) {
            const bestModel = recommended[0].name.replace('models/', '');
            console.log(`   CHAT_MODEL=${bestModel}`);
        }
        
    } catch (error) {
        console.error('Error listing models:', error.message);
    }
}

listModels();

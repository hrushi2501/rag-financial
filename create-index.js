/**
 * Create Pinecone Index via API
 * Run this script to create your index if the web console fails
 */

const { Pinecone } = require('@pinecone-database/pinecone');
require('dotenv').config();

async function createIndex() {
    try {
        console.log('🔑 Checking API key...');
        
        if (!process.env.PINECONE_API_KEY || process.env.PINECONE_API_KEY === 'your_pinecone_api_key_here') {
            console.error('❌ Please set PINECONE_API_KEY in your .env file first!');
            console.log('\n📝 Steps:');
            console.log('1. Go to https://app.pinecone.io/');
            console.log('2. Click "API Keys" in sidebar');
            console.log('3. Copy your API key');
            console.log('4. Add to .env file: PINECONE_API_KEY=your_key_here\n');
            process.exit(1);
        }

        const pinecone = new Pinecone({
            apiKey: process.env.PINECONE_API_KEY
        });

        const indexName = process.env.PINECONE_INDEX_NAME || 'financial-rag';

        console.log(`\n📊 Creating Pinecone index: "${indexName}"...`);
        console.log('⚙️  Configuration:');
        console.log('   - Dimension: 768');
        console.log('   - Metric: cosine');
        console.log('   - Cloud: AWS');
        console.log('   - Region: us-east-1\n');

        await pinecone.createIndex({
            name: indexName,
            dimension: 768,
            metric: 'cosine',
            spec: {
                serverless: {
                    cloud: 'aws',
                    region: 'us-east-1'
                }
            }
        });

        console.log('✅ Index created successfully!');
        console.log('\n⏳ Waiting for index to be ready (this may take 1-2 minutes)...\n');

        // Wait for index to be ready
        let ready = false;
        let attempts = 0;
        const maxAttempts = 30;

        while (!ready && attempts < maxAttempts) {
            try {
                const index = pinecone.index(indexName);
                const stats = await index.describeIndexStats();
                ready = true;
                console.log('✅ Index is ready!');
                console.log(`📊 Stats: ${JSON.stringify(stats, null, 2)}\n`);
            } catch (error) {
                attempts++;
                process.stdout.write('.');
                await new Promise(resolve => setTimeout(resolve, 4000));
            }
        }

        if (!ready) {
            console.log('\n⚠️  Index created but not yet ready. Check Pinecone console in a few minutes.');
        }

        console.log('🎉 All done! You can now start your server:\n');
        console.log('   node backend/server.js\n');

    } catch (error) {
        if (error.message.includes('already exists')) {
            console.log('✅ Index already exists! You\'re good to go.\n');
            console.log('🚀 Start your server:\n');
            console.log('   node backend/server.js\n');
        } else {
            console.error('❌ Error creating index:', error.message);
            console.log('\n🔧 Troubleshooting:');
            console.log('1. Check your PINECONE_API_KEY is correct in .env');
            console.log('2. Make sure you have internet connection');
            console.log('3. Try a different region (change "us-east-1" to "us-west-2" or "eu-west-1")');
            console.log('4. Check Pinecone status: https://status.pinecone.io/\n');
        }
    }
}

createIndex();

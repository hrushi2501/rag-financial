/**
 * Database Migration Script
 * Initializes PostgreSQL database with pgvector extension and creates required tables
 */

const { initializeDatabase, healthCheck, closePool } = require('./pgvector');

async function migrate() {
    console.log('\nDatabase migration starting...\n');
    console.log('='.repeat(50));

    try {
        // Check database connection
        console.log('\n1. Checking database connection...');
        const health = await healthCheck();

        if (!health.connected) {
            throw new Error(`Database connection failed: ${health.error}`);
        }

    console.log(`Database connected (latency: ${health.latency})`);

        // Initialize database schema
    console.log('\n2. Initializing database schema...');
    await initializeDatabase();
    console.log('Database schema initialized');

    console.log('\n' + '='.repeat(50));
    console.log('Migration completed successfully!\n');

        // Display summary
        console.log('Tables created:');
        console.log('  - documents: Stores uploaded document metadata');
        console.log('  - vectors: Stores text chunks with embeddings');
        console.log('  - conversations: Stores chat history');
        console.log('\nExtensions enabled:');
        console.log('  - vector: pgvector extension for similarity search');
        console.log('\nIndexes created:');
        console.log('  - vectors_document_id_idx: For efficient document queries');
        console.log('  - vectors_embedding_idx: IVFFlat index for vector similarity search');
        console.log('');

    } catch (error) {
        console.error('\nMigration failed:', error.message);
        console.error('\nPlease ensure:');
        console.error('  1. PostgreSQL is running');
        console.error('  2. Database credentials in .env are correct');
        console.error('  3. pgvector extension is installed');
        console.error('  4. Database user has sufficient permissions\n');
        process.exit(1);
    } finally {
        await closePool();
    }
}

// Run migration if executed directly
if (require.main === module) {
    migrate();
}

module.exports = { migrate };
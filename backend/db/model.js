// backend/db/model.js

/**
 * Database model definitions
 * Used for describing document and chunk/vector structure.
 * The actual queries are run via pgvector.js
 */

// Document schema
const Document = {
  id: 'SERIAL PRIMARY KEY',
  filename: 'VARCHAR(255) NOT NULL',
  upload_date: 'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP',
  filetype: 'VARCHAR(25)',
  chunk_count: 'INTEGER DEFAULT 0'
};

// Chunk schema (one row per chunk)
const Chunk = {
  id: 'SERIAL PRIMARY KEY',
  document_id: 'INTEGER REFERENCES documents(id) ON DELETE CASCADE',
  chunk_index: 'INTEGER',
  text: 'TEXT',
  token_count: 'INTEGER'
};

// Vector schema (per chunk, with pgvector)
const Vector = {
  id: 'SERIAL PRIMARY KEY',
  chunk_id: 'INTEGER REFERENCES chunks(id) ON DELETE CASCADE',
  embedding: 'VECTOR(768)' // pgvector type
};

module.exports = { Document, Chunk, Vector };

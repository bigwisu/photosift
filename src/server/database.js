const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class PhotoDatabase {
  constructor(dbPath) {
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initSchema();
  }

  initSchema() {
    // indexed_files table - stores all indexed photos
    // relative_path is PRIMARY KEY (unique identifier)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS indexed_files (
        relative_path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        mime_type TEXT NOT NULL,
        extracted_date TEXT NOT NULL,
        date_source TEXT NOT NULL,
        indexed_at TEXT NOT NULL,
        UNIQUE(hash)
      );
    `);

    // Create index on hash for fast duplicate lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_hash ON indexed_files(hash);
    `);

    // index_jobs table - tracks folder-level indexing progress
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS index_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT NOT NULL,
        status TEXT NOT NULL,
        total_files INTEGER DEFAULT 0,
        processed_files INTEGER DEFAULT 0,
        duplicates_found INTEGER DEFAULT 0,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        last_processed_file TEXT
      );
    `);
  }

  // Check if file hash already exists (duplicate detection)
  findDuplicateByHash(hash) {
    const stmt = this.db.prepare('SELECT * FROM indexed_files WHERE hash = ?');
    return stmt.get(hash);
  }

  // Check if file path already exists
  findByPath(relativePath) {
    const stmt = this.db.prepare('SELECT * FROM indexed_files WHERE relative_path = ?');
    return stmt.get(relativePath);
  }

  // Insert new indexed file
  insertFile(fileData) {
    const stmt = this.db.prepare(`
      INSERT INTO indexed_files (
        relative_path, hash, original_filename, file_size, 
        mime_type, extracted_date, date_source, indexed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    return stmt.run(
      fileData.relative_path,
      fileData.hash,
      fileData.original_filename,
      fileData.file_size,
      fileData.mime_type,
      fileData.extracted_date,
      fileData.date_source,
      fileData.indexed_at
    );
  }

  // Create new index job
  createIndexJob(folderPath) {
    const stmt = this.db.prepare(`
      INSERT INTO index_jobs (folder_path, status, started_at)
      VALUES (?, 'running', datetime('now'))
    `);
    const result = stmt.run(folderPath);
    return result.lastInsertRowid;
  }

  // Update index job progress
  updateIndexJobProgress(jobId, processedFiles, duplicatesFound, lastProcessedFile) {
    const stmt = this.db.prepare(`
      UPDATE index_jobs 
      SET processed_files = ?, duplicates_found = ?, last_processed_file = ?
      WHERE id = ?
    `);
    return stmt.run(processedFiles, duplicatesFound, lastProcessedFile, jobId);
  }

  // Complete index job
  completeIndexJob(jobId, totalFiles, processedFiles, duplicatesFound) {
    const stmt = this.db.prepare(`
      UPDATE index_jobs 
      SET status = 'completed', 
          total_files = ?,
          processed_files = ?,
          duplicates_found = ?,
          completed_at = datetime('now')
      WHERE id = ?
    `);
    return stmt.run(totalFiles, processedFiles, duplicatesFound, jobId);
  }

  // Get index job status
  getIndexJob(jobId) {
    const stmt = this.db.prepare('SELECT * FROM index_jobs WHERE id = ?');
    return stmt.get(jobId);
  }

  // Get all index jobs
  getAllIndexJobs(limit = 50) {
    const stmt = this.db.prepare(`
      SELECT * FROM index_jobs 
      ORDER BY started_at DESC 
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  // Get statistics
  getStats() {
    const totalFiles = this.db.prepare('SELECT COUNT(*) as count FROM indexed_files').get();
    const totalSize = this.db.prepare('SELECT SUM(file_size) as size FROM indexed_files').get();
    const uniqueHashes = this.db.prepare('SELECT COUNT(DISTINCT hash) as count FROM indexed_files').get();
    
    return {
      totalFiles: totalFiles.count,
      totalSize: totalSize.size || 0,
      uniqueFiles: uniqueHashes.count,
      duplicates: totalFiles.count - uniqueHashes.count
    };
  }

  close() {
    this.db.close();
  }
}

module.exports = PhotoDatabase;

// Made with Bob

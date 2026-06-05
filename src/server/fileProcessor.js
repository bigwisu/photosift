const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DateExtractor = require('./dateExtractor');

/**
 * File processor handles:
 * - SHA-256 hash computation during upload stream (before saving to disk)
 * - Date extraction
 * - Duplicate detection
 * - File organization
 */
class FileProcessor {
  constructor(database, targetDir, inputDir, duplicatesDir) {
    this.db = database;
    this.targetDir = targetDir;
    this.inputDir = inputDir;
    this.duplicatesDir = duplicatesDir;
    this.dateExtractor = new DateExtractor();
  }

  /**
   * Compute SHA-256 hash from file stream
   * CRITICAL: Must be computed BEFORE saving to disk for duplicate detection
   */
  async computeHashFromStream(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      stream.on('data', (chunk) => {
        hash.update(chunk);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Compute SHA-256 hash from buffer (for uploaded files in memory)
   */
  computeHashFromBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Process uploaded file:
   * 1. Compute hash from buffer (before saving)
   * 2. Check for duplicates
   * 3. Extract date
   * 4. Save to target directory with proper structure
   * 5. Index in database
   */
  async processUploadedFile(fileBuffer, originalFilename, mimeType) {
    // Step 1: Compute hash BEFORE saving to disk
    const hash = this.computeHashFromBuffer(fileBuffer);

    // Step 2: Check for duplicates
    const duplicate = this.db.findDuplicateByHash(hash);
    if (duplicate) {
      return {
        success: false,
        isDuplicate: true,
        existingFile: duplicate,
        message: `Duplicate file found: ${duplicate.relative_path}`
      };
    }

    // Step 3: Save to temporary location for date extraction
    const tempPath = path.join('/tmp', `temp_${Date.now()}_${originalFilename}`);
    fs.writeFileSync(tempPath, fileBuffer);

    try {
      // Step 4: Extract date
      const { date, source } = this.dateExtractor.extractDate(tempPath, originalFilename);
      const datePath = this.dateExtractor.formatDateForPath(date);

      // Step 5: Create target directory structure
      const targetSubDir = path.join(this.targetDir, datePath);
      if (!fs.existsSync(targetSubDir)) {
        fs.mkdirSync(targetSubDir, { recursive: true });
      }

      // Step 6: Move file to target location
      const targetFilename = this.generateUniqueFilename(targetSubDir, originalFilename);
      const targetPath = path.join(targetSubDir, targetFilename);
      fs.renameSync(tempPath, targetPath);

      // Step 7: Calculate relative path for database
      const relativePath = path.join(datePath, targetFilename);

      // Step 8: Index in database
      const fileData = {
        relative_path: relativePath,
        hash: hash,
        original_filename: originalFilename,
        file_size: fileBuffer.length,
        mime_type: mimeType,
        extracted_date: this.dateExtractor.formatDateForStorage(date),
        date_source: source,
        indexed_at: new Date().toISOString()
      };

      this.db.insertFile(fileData);

      return {
        success: true,
        isDuplicate: false,
        file: fileData,
        message: 'File uploaded and indexed successfully'
      };
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  /**
   * Index file from target directory (for building initial database)
   * Does NOT move files, only indexes them in database
   */
  async indexTargetFile(filePath, originalFilename) {
    // Step 1: Compute hash from file stream
    const hash = await this.computeHashFromStream(filePath);

    // Step 2: Check if already indexed
    const existing = this.db.findDuplicateByHash(hash);
    if (existing) {
      return {
        success: true,
        isDuplicate: true,
        existingFile: existing,
        message: `File already indexed: ${originalFilename}`
      };
    }

    // Step 3: Extract date
    const { date, source } = this.dateExtractor.extractDate(filePath, originalFilename);

    // Step 4: Get file stats
    const stats = fs.statSync(filePath);
    const mimeType = this.getMimeType(originalFilename);

    // Step 5: Calculate relative path (relative to target dir)
    const relativePath = path.relative(this.targetDir, filePath);

    // Step 6: Index in database
    const fileData = {
      relative_path: relativePath,
      hash: hash,
      original_filename: originalFilename,
      file_size: stats.size,
      mime_type: mimeType,
      extracted_date: this.dateExtractor.formatDateForStorage(date),
      date_source: source,
      indexed_at: new Date().toISOString()
    };

    this.db.insertFile(fileData);

    return {
      success: true,
      isDuplicate: false,
      file: fileData,
      message: 'File indexed successfully'
    };
  }

  /**
   * Process file from input directory (for scanning new uploads)
   * Checks against database and moves duplicates
   */
  async processInputFile(filePath, originalFilename) {
    // Step 1: Compute hash from file stream
    const hash = await this.computeHashFromStream(filePath);

    // Step 2: Check for duplicates against indexed files
    const duplicate = this.db.findDuplicateByHash(hash);
    if (duplicate) {
      // Move duplicate to /duplicates/ directory
      await this.moveToDuplicatesFolder(filePath, originalFilename);
      return {
        success: true,
        isDuplicate: true,
        existingFile: duplicate,
        message: `Duplicate moved to duplicates folder: ${originalFilename}`
      };
    }

    // Step 3: Extract date
    const { date, source } = this.dateExtractor.extractDate(filePath, originalFilename);
    const datePath = this.dateExtractor.formatDateForPath(date);

    // Step 4: Create target directory structure
    const targetSubDir = path.join(this.targetDir, datePath);
    if (!fs.existsSync(targetSubDir)) {
      fs.mkdirSync(targetSubDir, { recursive: true });
    }

    // Step 5: Move file to target location (not copy, to clear input)
    const targetFilename = this.generateUniqueFilename(targetSubDir, originalFilename);
    const targetPath = path.join(targetSubDir, targetFilename);
    fs.renameSync(filePath, targetPath);

    // Step 6: Get file stats
    const stats = fs.statSync(targetPath);
    const mimeType = this.getMimeType(originalFilename);

    // Step 7: Calculate relative path for database
    const relativePath = path.join(datePath, targetFilename);

    // Step 8: Index in database
    const fileData = {
      relative_path: relativePath,
      hash: hash,
      original_filename: originalFilename,
      file_size: stats.size,
      mime_type: mimeType,
      extracted_date: this.dateExtractor.formatDateForStorage(date),
      date_source: source,
      indexed_at: new Date().toISOString()
    };

    this.db.insertFile(fileData);

    return {
      success: true,
      isDuplicate: false,
      file: fileData,
      message: 'File processed and indexed successfully'
    };
  }

  /**
   * Move duplicate file to dedicated duplicates directory (outside /input)
   * NEVER delete duplicates - always move for user review
   */
  async moveToDuplicatesFolder(filePath, filename) {
    if (!fs.existsSync(this.duplicatesDir)) {
      fs.mkdirSync(this.duplicatesDir, { recursive: true });
    }

    const targetPath = path.join(this.duplicatesDir, filename);
    
    // Handle filename conflicts in duplicates folder
    let finalPath = targetPath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      finalPath = path.join(this.duplicatesDir, `${base}_${counter}${ext}`);
      counter++;
    }

    fs.renameSync(filePath, finalPath);
  }

  /**
   * Generate unique filename if file already exists in target directory
   */
  generateUniqueFilename(directory, filename) {
    let targetPath = path.join(directory, filename);
    let counter = 1;
    
    while (fs.existsSync(targetPath)) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      const newFilename = `${base}_${counter}${ext}`;
      targetPath = path.join(directory, newFilename);
      counter++;
    }

    return path.basename(targetPath);
  }

  /**
   * Get MIME type from filename extension
   */
  getMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

module.exports = FileProcessor;

// Made with Bob

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const DateExtractor = require('./dateExtractor');
const HeicConverter = require('./heicConverter');

/**
 * Move file across filesystems (handles EXDEV error)
 * Uses copy + delete instead of rename when crossing filesystem boundaries
 */
function moveFile(sourcePath, destPath) {
  try {
    // Try rename first (fastest if same filesystem)
    fs.renameSync(sourcePath, destPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      // Cross-device link error - copy and delete instead
      fs.copyFileSync(sourcePath, destPath);
      fs.unlinkSync(sourcePath);
    } else {
      throw error;
    }
  }
}

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
    this.heicConverter = new HeicConverter(parseInt(process.env.HEIC_CONVERT_QUALITY) || 90);
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
   * 1. Convert HEIC to JPEG if enabled and needed
   * 2. Compute hash from buffer (before saving)
   * 3. Check for duplicates
   * 4. Extract date
   * 5. Save to target directory with proper structure
   * 6. Index in database
   */
  async processUploadedFile(fileBuffer, originalFilename, mimeType) {
    // Step 1: Convert HEIC to JPEG if enabled
    const heicAutoConvert = process.env.HEIC_AUTO_CONVERT === 'true';
    if (heicAutoConvert && this.heicConverter.isHeic(originalFilename)) {
      console.log(`Converting HEIC file: ${originalFilename}`);
      const converted = await this.heicConverter.convertToJpeg(fileBuffer, originalFilename);
      fileBuffer = converted.buffer;
      originalFilename = converted.filename;
      mimeType = converted.mimeType;
      console.log(`HEIC converted to: ${originalFilename}`);
    }

    // Step 2: Compute hash BEFORE saving to disk
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

      // Step 6: Move file to target location (cross-filesystem safe)
      const targetFilename = this.generateUniqueFilename(targetSubDir, originalFilename);
      const targetPath = path.join(targetSubDir, targetFilename);
      moveFile(tempPath, targetPath);

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
        indexed_at: new Date().toISOString(),
        mtime: Date.now()
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
   * INCREMENTAL: Skips files that haven't changed since last scan
   * MIGRATION-SAFE: Handles mtime=0 for migrated databases
   * HEIC-AWARE: Converts HEIC files to JPEG during indexing (if enabled)
   */
  async indexTargetFile(filePath, originalFilename) {
    // Step 1: Handle HEIC conversion if enabled
    let fileToProcess = filePath;
    let filenameToUse = originalFilename;
    let tempFilePath = null;
    
    const heicAutoConvert = process.env.HEIC_AUTO_CONVERT === 'true';
    if (heicAutoConvert && this.heicConverter.isHeic(originalFilename)) {
      console.log(`Converting HEIC file during indexing: ${originalFilename}`);
      const converted = await this.heicConverter.convertFile(filePath);
      
      // Create temp file for converted JPEG
      tempFilePath = path.join('/tmp', `heic_convert_${Date.now()}_${converted.filename}`);
      fs.writeFileSync(tempFilePath, converted.buffer);
      
      fileToProcess = tempFilePath;
      filenameToUse = converted.filename;
      console.log(`HEIC converted to: ${filenameToUse}`);
    }

    try {
      // Step 2: Get file stats first (for mtime check)
      const stats = fs.statSync(fileToProcess);
      const fileMtime = Math.floor(stats.mtimeMs);
      
      // Step 3: Calculate relative path (relative to target dir)
      const relativePath = path.relative(this.targetDir, filePath);
      
      // Step 4: Check if file already indexed and unchanged
      const existingByPath = this.db.findByPath(relativePath);
      if (existingByPath && !tempFilePath) {
        // Migration check: If mtime=0, this is from old database - must reprocess
        if (existingByPath.mtime === 0) {
          // File from migrated database, needs mtime update
          // Will reprocess below to set proper mtime
        } else if (existingByPath.mtime === fileMtime && existingByPath.file_size === stats.size) {
          // File unchanged, skip processing
          return {
            success: true,
            isDuplicate: false,
            skipped: true,
            existingFile: existingByPath,
            message: `File unchanged, skipped: ${filenameToUse}`
          };
        }
        // File modified or needs migration, will reprocess below
      }

      // Step 5: Compute hash from file stream
      const hash = await this.computeHashFromStream(fileToProcess);

      // Step 6: Check if hash already exists (duplicate detection)
      const existingByHash = this.db.findDuplicateByHash(hash);
      if (existingByHash && existingByHash.relative_path !== relativePath) {
        // Different file with same hash = duplicate
        return {
          success: true,
          isDuplicate: true,
          existingFile: existingByHash,
          message: `Duplicate file found: ${filenameToUse}`
        };
      }

      // Step 7: Extract date
      const { date, source } = this.dateExtractor.extractDate(fileToProcess, filenameToUse);
      const mimeType = this.getMimeType(filenameToUse);

      // Step 8: Prepare file data
      const fileData = {
        relative_path: relativePath,
        hash: hash,
        original_filename: filenameToUse,
        file_size: stats.size,
        mime_type: mimeType,
        extracted_date: this.dateExtractor.formatDateForStorage(date),
        date_source: source,
        indexed_at: new Date().toISOString(),
        mtime: fileMtime
      };

      // Step 9: Insert or update in database
      if (existingByPath) {
        this.db.updateFile(fileData);
      } else {
        this.db.insertFile(fileData);
      }

      return {
        success: true,
        isDuplicate: false,
        skipped: false,
        file: fileData,
        message: existingByPath ? 'File re-indexed (modified)' : 'File indexed successfully'
      };
    } finally {
      // Clean up temp file if created
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  }

  /**
   * Process file from input directory (for scanning new uploads)
   * Checks against database and moves duplicates
   * HEIC-AWARE: Converts HEIC files to JPEG before processing (if enabled)
   */
  async processInputFile(filePath, originalFilename) {
    // Step 1: Handle HEIC conversion if enabled
    let fileToProcess = filePath;
    let filenameToUse = originalFilename;
    let convertedBuffer = null;
    
    const heicAutoConvert = process.env.HEIC_AUTO_CONVERT === 'true';
    if (heicAutoConvert && this.heicConverter.isHeic(originalFilename)) {
      console.log(`Converting HEIC file from input: ${originalFilename}`);
      const converted = await this.heicConverter.convertFile(filePath);
      convertedBuffer = converted.buffer;
      filenameToUse = converted.filename;
      console.log(`HEIC converted to: ${filenameToUse}`);
    }

    // Step 2: Compute hash from file stream or buffer
    const hash = convertedBuffer
      ? this.computeHashFromBuffer(convertedBuffer)
      : await this.computeHashFromStream(filePath);

    // Step 3: Check for duplicates against indexed files
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

    // Step 4: Extract date (use converted buffer if HEIC)
    const { date, source } = convertedBuffer
      ? this.dateExtractor.extractDate(null, filenameToUse)
      : this.dateExtractor.extractDate(filePath, filenameToUse);
    const datePath = this.dateExtractor.formatDateForPath(date);

    // Step 5: Create target directory structure
    const targetSubDir = path.join(this.targetDir, datePath);
    if (!fs.existsSync(targetSubDir)) {
      fs.mkdirSync(targetSubDir, { recursive: true });
    }

    // Step 6: Move/write file to target location
    const targetFilename = this.generateUniqueFilename(targetSubDir, filenameToUse);
    const targetPath = path.join(targetSubDir, targetFilename);
    
    if (convertedBuffer) {
      // Write converted JPEG buffer
      fs.writeFileSync(targetPath, convertedBuffer);
      // Delete original HEIC file
      fs.unlinkSync(filePath);
    } else {
      // Move original file (cross-filesystem safe)
      moveFile(filePath, targetPath);
    }

    // Step 7: Get file stats
    const stats = fs.statSync(targetPath);
    const mimeType = this.getMimeType(filenameToUse);

    // Step 8: Calculate relative path for database
    const relativePath = path.join(datePath, targetFilename);

    // Step 9: Index in database
    const fileData = {
      relative_path: relativePath,
      hash: hash,
      original_filename: filenameToUse,
      file_size: stats.size,
      mime_type: mimeType,
      extracted_date: this.dateExtractor.formatDateForStorage(date),
      date_source: source,
      indexed_at: new Date().toISOString(),
      mtime: Math.floor(stats.mtimeMs)
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

    moveFile(filePath, finalPath);
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
      '.heic': 'image/heic',
      '.heif': 'image/heif',
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

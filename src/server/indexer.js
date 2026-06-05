const fs = require('fs');
const path = require('path');

/**
 * Background indexer with configurable throttling
 * Processes files one-by-one with pause/resume capability
 */
class BackgroundIndexer {
  constructor(database, fileProcessor, inputDir, targetDir, throttleMs = 500) {
    this.db = database;
    this.fileProcessor = fileProcessor;
    this.inputDir = inputDir;
    this.targetDir = targetDir;
    this.throttleMs = throttleMs;
    this.isRunning = false;
    this.currentJobId = null;
    this.shouldStop = false;
  }

  /**
   * Start indexing target directory (for building initial database)
   * Returns job ID for tracking progress
   */
  async startIndexingTarget() {
    return this.startIndexing(this.targetDir, 'target');
  }

  /**
   * Start scanning input directory (for processing new uploads)
   * Returns job ID for tracking progress
   */
  async startScanningInput() {
    return this.startIndexing(this.inputDir, 'input');
  }

  /**
   * Start indexing a folder
   * Returns job ID for tracking progress
   */
  async startIndexing(folderPath, mode = 'input') {
    if (this.isRunning) {
      throw new Error('Indexer is already running');
    }

    // Create index job
    this.currentJobId = this.db.createIndexJob(folderPath);
    this.isRunning = true;
    this.shouldStop = false;

    // Start indexing in background (don't await)
    this.indexFolder(folderPath, this.currentJobId, mode).catch(error => {
      console.error('Indexing error:', error);
      this.isRunning = false;
    });

    return this.currentJobId;
  }

  /**
   * Stop the current indexing job
   */
  stop() {
    this.shouldStop = true;
  }

  /**
   * Get current job status
   */
  getStatus() {
    if (!this.currentJobId) {
      return { running: false };
    }

    const job = this.db.getIndexJob(this.currentJobId);
    return {
      running: this.isRunning,
      job: job
    };
  }

  /**
   * Index all files in a folder recursively
   * Processes files one-by-one with throttling
   * @param {string} mode - 'target' for indexing existing files, 'input' for processing new uploads
   */
  async indexFolder(folderPath, jobId, mode = 'input') {
    try {
      // Get all files recursively
      const files = this.getAllFiles(folderPath);
      const totalFiles = files.length;

      let processedFiles = 0;
      let duplicatesFound = 0;

      for (const filePath of files) {
        // Check if we should stop
        if (this.shouldStop) {
          console.log('Indexing stopped by user');
          break;
        }

        try {
          const filename = path.basename(filePath);
          
          // Use different processing method based on mode
          const result = mode === 'target'
            ? await this.fileProcessor.indexTargetFile(filePath, filename)
            : await this.fileProcessor.processInputFile(filePath, filename);

          if (result.isDuplicate) {
            duplicatesFound++;
          }

          processedFiles++;

          // Update job progress
          this.db.updateIndexJobProgress(jobId, processedFiles, duplicatesFound, filePath);

          // Throttle: wait before processing next file
          if (this.throttleMs > 0) {
            await this.sleep(this.throttleMs);
          }
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
          // Continue with next file
        }
      }

      // Complete the job
      this.db.completeIndexJob(jobId, totalFiles, processedFiles, duplicatesFound);
      this.isRunning = false;
      this.currentJobId = null;

      console.log(`Indexing completed: ${processedFiles}/${totalFiles} files processed, ${duplicatesFound} duplicates found`);
    } catch (error) {
      console.error('Indexing failed:', error);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Get all files in directory recursively
   * Filters for image and video files only
   */
  getAllFiles(dirPath, arrayOfFiles = []) {
    let files;
    
    // Handle permission errors gracefully
    try {
      files = fs.readdirSync(dirPath);
    } catch (error) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        console.log(`Skipping directory (permission denied): ${dirPath}`);
        return arrayOfFiles;
      }
      throw error;
    }

    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      
      // Skip system directories
      if (file === 'duplicates' || file === 'lost+found' || file.startsWith('.')) {
        return;
      }

      try {
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
        } else {
          // Only process image and video files
          if (this.isMediaFile(file)) {
            arrayOfFiles.push(filePath);
          }
        }
      } catch (error) {
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          console.log(`Skipping file (permission denied): ${filePath}`);
        } else {
          console.error(`Error accessing ${filePath}:`, error.message);
        }
      }
    });

    return arrayOfFiles;
  }

  /**
   * Check if file is a supported media file
   */
  isMediaFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    const supportedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
      '.mp4', '.mov', '.avi', '.mkv'
    ];
    return supportedExtensions.includes(ext);
  }

  /**
   * Sleep utility for throttling
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Set throttle delay
   */
  setThrottle(ms) {
    this.throttleMs = ms;
  }
}

module.exports = BackgroundIndexer;

// Made with Bob

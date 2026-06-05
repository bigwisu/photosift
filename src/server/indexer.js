const fs = require('fs');
const path = require('path');

/**
 * Background indexer with configurable throttling
 * Processes files one-by-one with pause/resume capability
 */
class BackgroundIndexer {
  constructor(database, fileProcessor, inputDir, throttleMs = 500) {
    this.db = database;
    this.fileProcessor = fileProcessor;
    this.inputDir = inputDir;
    this.throttleMs = throttleMs;
    this.isRunning = false;
    this.currentJobId = null;
    this.shouldStop = false;
  }

  /**
   * Start indexing a folder
   * Returns job ID for tracking progress
   */
  async startIndexing(folderPath = this.inputDir) {
    if (this.isRunning) {
      throw new Error('Indexer is already running');
    }

    // Create index job
    this.currentJobId = this.db.createIndexJob(folderPath);
    this.isRunning = true;
    this.shouldStop = false;

    // Start indexing in background (don't await)
    this.indexFolder(folderPath, this.currentJobId).catch(error => {
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
   */
  async indexFolder(folderPath, jobId) {
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
          const result = await this.fileProcessor.processInputFile(filePath, filename);

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
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      
      // Skip duplicates folder
      if (file === 'duplicates') {
        return;
      }

      if (fs.statSync(filePath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
      } else {
        // Only process image and video files
        if (this.isMediaFile(file)) {
          arrayOfFiles.push(filePath);
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

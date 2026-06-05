require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const PhotoDatabase = require('./database');
const FileProcessor = require('./fileProcessor');
const BackgroundIndexer = require('./indexer');

// Configuration
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || '/app/data/photos.db';
const TARGET_DIR = process.env.TARGET_DIR || '/target';
const INPUT_DIR = process.env.INPUT_DIR || '/input';
const DUPLICATES_DIR = process.env.DUPLICATES_DIR || '/duplicates';
const INDEXER_THROTTLE_MS = parseInt(process.env.INDEXER_THROTTLE_MS || '500');

// Ensure directories exist
[TARGET_DIR, INPUT_DIR, DUPLICATES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Initialize components
const database = new PhotoDatabase(DB_PATH);
const fileProcessor = new FileProcessor(database, TARGET_DIR, INPUT_DIR, DUPLICATES_DIR);
const indexer = new BackgroundIndexer(database, fileProcessor, INPUT_DIR, TARGET_DIR, INDEXER_THROTTLE_MS);

// Express app setup
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/build')));

// Multer configuration for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images and videos are allowed.'));
    }
  }
});

// API Routes

/**
 * GET /api/stats
 * Get database statistics
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = database.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * POST /api/upload
 * Upload single file
 */
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await fileProcessor.processUploadedFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    if (result.isDuplicate) {
      return res.status(409).json(result);
    }

    res.json(result);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to process upload' });
  }
});

/**
 * POST /api/upload/multiple
 * Upload multiple files
 */
app.post('/api/upload/multiple', upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const results = [];
    for (const file of req.files) {
      try {
        const result = await fileProcessor.processUploadedFile(
          file.buffer,
          file.originalname,
          file.mimetype
        );
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          filename: file.originalname,
          error: error.message
        });
      }
    }

    const successful = results.filter(r => r.success && !r.isDuplicate).length;
    const duplicates = results.filter(r => r.isDuplicate).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      total: req.files.length,
      successful,
      duplicates,
      failed,
      results
    });
  } catch (error) {
    console.error('Multiple upload error:', error);
    res.status(500).json({ error: 'Failed to process uploads' });
  }
});

/**
 * POST /api/indexer/index-target
 * Start indexing target directory (build initial database)
 */
app.post('/api/indexer/index-target', async (req, res) => {
  try {
    const jobId = await indexer.startIndexingTarget();
    res.json({
      success: true,
      jobId,
      message: 'Target directory indexing started'
    });
  } catch (error) {
    console.error('Indexer start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/indexer/scan-input
 * Start scanning input directory (process new uploads)
 */
app.post('/api/indexer/scan-input', async (req, res) => {
  try {
    const jobId = await indexer.startScanningInput();
    res.json({
      success: true,
      jobId,
      message: 'Input directory scanning started'
    });
  } catch (error) {
    console.error('Indexer start error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/indexer/stop
 * Stop background indexing
 */
app.post('/api/indexer/stop', (req, res) => {
  try {
    indexer.stop();
    res.json({
      success: true,
      message: 'Indexing stopped'
    });
  } catch (error) {
    console.error('Indexer stop error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/indexer/status
 * Get current indexer status
 */
app.get('/api/indexer/status', (req, res) => {
  try {
    const status = indexer.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Indexer status error:', error);
    res.status(500).json({ error: 'Failed to get indexer status' });
  }
});

/**
 * GET /api/indexer/jobs
 * Get all index jobs history
 */
app.get('/api/indexer/jobs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const jobs = database.getAllIndexJobs(limit);
    res.json(jobs);
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to get jobs' });
  }
});

/**
 * PUT /api/indexer/throttle
 * Update indexer throttle delay
 */
app.put('/api/indexer/throttle', (req, res) => {
  try {
    const { throttleMs } = req.body;
    if (typeof throttleMs !== 'number' || throttleMs < 0) {
      return res.status(400).json({ error: 'Invalid throttle value' });
    }
    indexer.setThrottle(throttleMs);
    res.json({
      success: true,
      throttleMs,
      message: 'Throttle updated'
    });
  } catch (error) {
    console.error('Throttle update error:', error);
    res.status(500).json({ error: 'Failed to update throttle' });
  }
});

/**
 * GET /api/files
 * Search/list indexed files
 */
app.get('/api/files', (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const stmt = database.db.prepare(`
      SELECT * FROM indexed_files 
      ORDER BY extracted_date DESC 
      LIMIT ? OFFSET ?
    `);
    const files = stmt.all(parseInt(limit), parseInt(offset));
    res.json(files);
  } catch (error) {
    console.error('Get files error:', error);
    res.status(500).json({ error: 'Failed to get files' });
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected',
    indexer: indexer.isRunning ? 'running' : 'idle'
  });
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/build/index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`PhotoSift server running on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Target directory: ${TARGET_DIR}`);
  console.log(`Input directory: ${INPUT_DIR}`);
  console.log(`Duplicates directory: ${DUPLICATES_DIR}`);
  console.log(`Indexer throttle: ${INDEXER_THROTTLE_MS}ms`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  database.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing database...');
  database.close();
  process.exit(0);
});

// Made with Bob

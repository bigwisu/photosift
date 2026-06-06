<div align="center">
  # PhotoSift - NAS Photo Deduplicator
  
  A web-based photo backup system that automatically organizes photos by date, detects duplicates, and provides a clean interface for managing your photo library.
  
  ---
  <img src="docs/images/bob-logo.png" alt="Bob Logo" width="200"/>

  **Built by IBM Bob** - A personal photo management solution for Ubuntu-based NAS systems.
  
  *Proof that Spec-Driven Development with AI is faster than searching for the perfect app!*
</div>

## Features

- **Smart Date Extraction**: 4-level fallback chain (EXIF → Filename regex → mtime → current date)
- **HEIC Support**: Automatic conversion of Apple HEIC/HEIF images to JPEG with EXIF preservation
- **Duplicate Detection**: SHA-256 hash-based duplicate detection during upload
- **Automatic Organization**: Photos organized as `/target/YYYY/MM/` or `/target/YYYY/MM-custom-name/`
- **Incremental Scanning**: Only processes new or modified files on rescans
- **Background Indexer**: Scan and index existing photos with configurable throttling
- **Web Interface**: Responsive React UI with upload, indexer, and statistics screens
- **SQLite Database**: Efficient storage for millions of photos
- **Docker Deployment**: Single container with docker-compose

## Supported File Formats

### Images
- **JPEG/JPG**: Standard photo format
- **PNG**: Screenshots and graphics
- **GIF**: Animated images
- **BMP**: Bitmap images
- **WebP**: Modern web format
- **HEIC/HEIF**: Apple iPhone photos (automatically converted to JPEG)

### Videos
- **MP4**: Standard video format
- **MOV**: QuickTime/iPhone videos
- **AVI**: Windows video format
- **MKV**: Matroska video format

### Date Extraction Sources

PhotoSift recognizes and extracts dates from:

- **HEIC/HEIF**: Apple iPhone photos (EXIF preserved during conversion)
- **WhatsApp**: `WhatsApp Image 2024-01-15 at 14.30.45.jpeg`
- **Screenshots**: `Screenshot 2024-01-15 at 14.30.45.png`
- **Google Pixel**: `PXL_20240115_143045123.jpg`
- **Android**: `IMG_20240115_143045.jpg`
- **EXIF metadata**: Standard camera photos
- **File modification time**: Fallback for other files

## Architecture

### Critical Design Decisions

1. **Date Extraction Fallback Chain** (4 levels):
   - Level 1: EXIF metadata
   - Level 2: Filename regex patterns (REQUIRED for WhatsApp files)
   - Level 3: File modification time
   - Level 4: Current date

2. **Duplicate Detection**:
   - SHA-256 hash computed during upload stream (before saving to disk)
   - Database lookup by hash before any file I/O operations
   - Duplicates moved to `/input/duplicates/` (never deleted)

3. **Database Schema**:
   - `indexed_files`: PK = `relative_path`, indexed `hash` column
   - `index_jobs`: Tracks folder-level indexing progress

4. **Background Indexer**:
   - Configurable throttle delay (default 500ms)
   - One-by-one file processing with pause/resume capability
   - Progress saved to database for recovery

## Installation

### Prerequisites

- Docker and Docker Compose
- NAS or network storage mounted on host
- (Optional) SMB/WebDAV sync folder for automatic scanning

### Quick Start

1. Clone the repository:
```bash
git clone <repository-url>
cd photosift
```

2. Update volume paths in `docker-compose.yml`:
```yaml
volumes:
  - ./data:/app/data                    # SQLite database
  - /path/to/nas/photos:/target         # Organized photos storage
  - /path/to/input/folder:/input        # Scan folder (SMB/WebDAV)
```

3. Build and start:
```bash
docker-compose up -d
```

4. Access the web interface:
```
http://localhost:3000
```

## Usage

### Upload Photos

1. Navigate to the **Upload** tab
2. Drag & drop files or click "Browse Files"
3. Upload single or multiple files
4. View results: successful uploads, duplicates detected, failed uploads

### Index & Scan Photos

**Initial Setup (First Time):**
1. Navigate to the **Indexer** tab
2. Click "📁 Index Target" to build database from existing photos in `/target`
3. Wait for indexing to complete

**Daily Use (Process New Uploads):**
1. Navigate to the **Indexer** tab
2. Click "🔍 Scan Input" to process new photos from `/input`
3. Monitor progress in real-time
4. Duplicates are automatically moved to `/duplicates/` directory
5. New photos are moved to `/target/YYYY/MM/` and indexed
6. Adjust throttle delay if needed (default 500ms)

### View Statistics

1. Navigate to the **Statistics** tab
2. View total files, unique files, duplicates, and total size
3. Browse recent files with date source information
4. Paginate through indexed files

## Configuration

Environment variables (set in `docker-compose.yml` or `.env`):

```bash
PORT=3000                          # Web server port
DB_PATH=/app/data/photos.db        # SQLite database path
TARGET_DIR=/target                 # Organized photos directory
INPUT_DIR=/input                   # Scan directory
DUPLICATES_DIR=/duplicates         # Duplicates directory (separate from input)
INDEXER_THROTTLE_MS=500           # Delay between file processing (ms)
HEIC_CONVERT_QUALITY=90           # JPEG quality for HEIC conversion (1-100)
```

### HEIC Conversion

PhotoSift automatically converts Apple HEIC/HEIF images to JPEG format:

- **Quality**: Configurable via `HEIC_CONVERT_QUALITY` (default: 90)
- **EXIF Preservation**: All metadata (date, GPS, camera info) is preserved
- **Storage Savings**: Typically 30-50% smaller than original HEIC files
- **Compatibility**: Converted JPEGs work in all browsers and devices
- **Original Filename**: Tracked in database (e.g., `IMG_1234.heic` → `IMG_1234.jpg`)

**Performance Impact:**
- Conversion time: ~50-100ms per photo
- Happens during upload or scan (before saving to disk)
- No impact on already-indexed files

## Volume Mounts

- `/app/data`: SQLite database storage (persistent)
- `/target`: Organized photos storage (NAS mount)
- `/input`: Input folder for scanning (SMB/WebDAV sync)
- `/duplicates`: Duplicate files directory (separate from input, for user review)

## API Endpoints

- `GET /api/stats` - Get database statistics
- `POST /api/upload` - Upload single file
- `POST /api/upload/multiple` - Upload multiple files
- `POST /api/indexer/index-target` - Index target directory (build database)
- `POST /api/indexer/scan-input` - Scan input directory (process new uploads)
- `POST /api/indexer/stop` - Stop background indexing
- `GET /api/indexer/status` - Get indexer status
- `GET /api/indexer/jobs` - Get indexing job history
- `PUT /api/indexer/throttle` - Update throttle delay
- `GET /api/files` - List indexed files
- `GET /api/health` - Health check

## Development

### Local Development

1. Install dependencies:
```bash
npm install
cd src/frontend && npm install
```

2. Start backend:
```bash
npm run dev
```

3. Start frontend (in another terminal):
```bash
cd src/frontend
npm start
```

4. Access at `http://localhost:3000`

### Build Frontend

```bash
cd src/frontend
npm run build
```

## Database

PhotoSift uses SQLite for efficient storage:

- **Max database size**: 281 TB (theoretical limit)
- **Practical capacity**: 1M+ photos (database ~100-500 MB)
- **Migration path**: Can migrate to PostgreSQL if needed

### Schema

**indexed_files**:
- `relative_path` (TEXT, PRIMARY KEY)
- `hash` (TEXT, INDEXED)
- `original_filename` (TEXT)
- `file_size` (INTEGER)
- `mime_type` (TEXT)
- `extracted_date` (TEXT)
- `date_source` (TEXT)
- `indexed_at` (TEXT)
- `mtime` (INTEGER) - File modification time for incremental scanning

**index_jobs**:
- `id` (INTEGER, PRIMARY KEY)
- `folder_path` (TEXT)
- `status` (TEXT)
- `total_files` (INTEGER)
- `processed_files` (INTEGER)
- `duplicates_found` (INTEGER)
- `started_at` (TEXT)
- `completed_at` (TEXT)
- `last_processed_file` (TEXT)

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite (better-sqlite3)
- **Frontend**: React
- **File Processing**: SHA-256 hashing, EXIF parsing, HEIC conversion (Sharp)
- **Image Processing**: Sharp (for HEIC → JPEG conversion)
- **Deployment**: Docker + docker-compose

## License

MIT License - see LICENSE file for details

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.
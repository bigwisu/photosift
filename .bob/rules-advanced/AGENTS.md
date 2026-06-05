# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## PhotoSift Advanced Mode Rules (Non-Obvious)

### Date Extraction Implementation
- MUST implement 4-level fallback chain in exact order: EXIF → Filename regex → mtime → current date
- **WhatsApp files have NO EXIF metadata** - filename regex is the ONLY way to extract dates
- Filename regex patterns are MANDATORY (not optional):
  - WhatsApp: `WhatsApp (Image|Video) YYYY-MM-DD at HH.MM.SS.(jpeg|mp4)`
  - Screenshots: `Screenshot YYYY-MM-DD at HH.MM.SS.(png|jpg)`
  - Google Pixel: `PXL_YYYYMMDD_HHMMSS###.(jpg|mp4)` (### = sequence number)
  - Android: `IMG_YYYYMMDD_HHMMSS.jpg`
- Date extraction MUST happen before file is saved to disk

### Duplicate Detection
- SHA-256 hash MUST be computed during upload stream (not after file save)
- Hash computation MUST happen before writing to disk to avoid saving duplicates
- Database lookup by hash MUST occur before any file I/O operations

### Database Schema
- `indexed_files.relative_path` is PRIMARY KEY (not `id`)
- `indexed_files.hash` MUST have index for fast duplicate lookups
- `index_jobs` tracks folder-level progress (not file-level)

### File Handling
- Duplicates from `/input` scan MUST be moved to `/input/duplicates/` subdirectory
- NEVER delete duplicates automatically - always move for user review
- Target directory structure is `/target/YYYY/MM/` or `/target/YYYY/MM-custom-name/`

### Background Indexer
- MUST support configurable throttle delay between files (default 500ms)
- Progress MUST be saved to `index_jobs` table for pause/resume capability
- Indexer MUST process files one-by-one (no batch processing)

### Volume Paths
- `/target` = NAS photos storage (read-write)
- `/app/data` = SQLite database location
- `/input` = SMB/WebDAV sync folder for scanning
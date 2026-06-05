# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project: PhotoSift - NAS Photo Deduplicator

This is a **planned but not yet implemented** web-based photo backup system. All implementation details are in PLAN.md.

## Critical Architecture Decisions (Non-Obvious)

- **Date Extraction Fallback Chain**: MUST follow 4-level fallback: EXIF → Filename regex → mtime → current date
- **WhatsApp Files Have NO EXIF**: All WhatsApp images/videos strip EXIF metadata - MUST use filename regex
- **Filename Regex Patterns**:
  - WhatsApp: `WhatsApp (Image|Video) YYYY-MM-DD at HH.MM.SS.(jpeg|mp4)`
  - Screenshots: `Screenshot YYYY-MM-DD at HH.MM.SS.(png|jpg)`
  - Google Pixel: `PXL_YYYYMMDD_HHMMSS###.(jpg|mp4)` (### = sequence number)
  - Android: `IMG_YYYYMMDD_HHMMSS.jpg`
- **Duplicate Detection**: SHA-256 hash MUST be computed during upload stream (before saving to disk)
- **Database**: SQLite with `indexed_files` (PK: relative_path) and `index_jobs` tables
- **Volume Mounts**: `/target` (photos), `/app/data` (SQLite DB), `/input` (SMB/WebDAV sync folder)
- **Duplicate Handling**: Duplicates from `/input` scan MUST be moved to `/input/duplicates/` (not deleted)
- **Indexing Throttle**: Background indexer MUST support configurable delay between files (default 500ms)
- **Target Directory Structure**: Photos organized as `/target/YYYY/MM/` or `/target/YYYY/MM-custom-name/`

## Tech Stack (Planned)

- Backend: Node.js + Express
- Database: SQLite (photos.db)
  - Max database size: 281 TB (theoretical limit)
  - Practical limit: Handles millions of rows efficiently
  - For PhotoSift: Can easily handle 1M+ photos (database ~100-500 MB)
  - Migration path: Can migrate to PostgreSQL if needed (straightforward schema conversion)
- Frontend: React + Vue (responsive web UI, flat design style)
- Deployment: Single Docker container with docker-compose
- File Processing: SHA-256 hashing, EXIF parsing, regex-based date extraction

## Implementation Priority

1. SQLite schema setup (indexed_files, index_jobs tables)
2. Date extraction with fallback chain
3. SHA-256 hash computation during upload
4. Duplicate detection logic
5. Web UI with upload/scan/indexer screens
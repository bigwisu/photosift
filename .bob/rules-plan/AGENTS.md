# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## PhotoSift Architecture Rules (Non-Obvious)

### Critical Design Constraints
- Hash computation MUST occur during upload stream (not after file save)
- This prevents duplicate files from ever touching disk
- Database lookup by hash MUST happen before any file I/O

### Date Extraction Architecture
- Four-level fallback chain is MANDATORY (not optional):
  1. EXIF metadata parsing
  2. Filename regex pattern matching (WhatsApp/Android/Screenshot formats)
  3. Filesystem mtime
  4. Current system date
- **WhatsApp files have NO EXIF metadata** - filename regex is the ONLY way to extract dates
- Filename patterns:
  - WhatsApp: `WhatsApp (Image|Video) YYYY-MM-DD at HH.MM.SS.(jpeg|mp4)`
  - Screenshots: `Screenshot YYYY-MM-DD at HH.MM.SS.(png|jpg)`
  - Google Pixel: `PXL_YYYYMMDD_HHMMSS###.(jpg|mp4)` (### = sequence number)
  - Android: `IMG_YYYYMMDD_HHMMSS.jpg`
- Each level must be attempted before falling back to next
- Date extraction determines target directory structure

### Duplicate Handling Strategy
- Duplicates are MOVED to `/input/duplicates/` (never deleted)
- This allows manual review before permanent deletion
- Original file path must be displayed in UI for reference

### Background Indexer Design
- Throttled processing prevents NAS overload
- Configurable delay between files (default 500ms)
- Progress saved to `index_jobs` table for pause/resume
- One-by-one processing (no batch operations)

### Database Schema Decisions
- `relative_path` as PRIMARY KEY (not auto-increment `id`)
- This enforces uniqueness at database level
- `hash` column must be indexed for fast duplicate lookups
- `index_jobs` tracks folder-level (not file-level) progress

### Volume Mount Architecture
- Three distinct mounts with specific purposes:
  - `/target` = main storage (read-write, organized by date)
  - `/app/data` = SQLite persistence (survives container restarts)
  - `/input` = sync folder (SMB/WebDAV integration point)
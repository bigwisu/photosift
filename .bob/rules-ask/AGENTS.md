# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## PhotoSift Documentation Context (Non-Obvious)

### Project Status
- This is a **planned but not yet implemented** project
- All implementation details are in PLAN.md (not in code yet)
- No actual codebase exists - only architectural planning

### Architecture Documentation
- PLAN.md contains complete technical specification
- Includes database schema, workflows, and UI design
- Mermaid diagrams show system architecture
- Volume mount strategy is critical for Docker deployment

### Key Non-Standard Decisions
- SQLite chosen over PostgreSQL (lightweight, no daemon required)
- `relative_path` as PRIMARY KEY instead of auto-increment `id`
- Duplicate files moved to `/input/duplicates/` (not deleted)
- Four-level date extraction fallback (EXIF → regex → mtime → current)
- Throttled indexing to prevent NAS overload (configurable delay)

### Volume Mount Strategy
- Three separate mounts with distinct purposes:
  - `/target` = main photo storage (read-write)
  - `/app/data` = SQLite database persistence
  - `/input` = SMB/WebDAV sync folder for batch processing
- This separation is intentional for backup and sync workflows
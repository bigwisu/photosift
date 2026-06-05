const exifParser = require('exif-parser');
const fs = require('fs');

/**
 * Date Extraction with 4-level fallback chain:
 * 1. EXIF metadata
 * 2. Filename regex patterns
 * 3. File mtime (modification time)
 * 4. Current date
 */
class DateExtractor {
  constructor() {
    // Filename regex patterns for common photo sources
    this.patterns = [
      {
        name: 'WhatsApp',
        regex: /WhatsApp (?:Image|Video) (\d{4})-(\d{2})-(\d{2}) at (\d{2})\.(\d{2})\.(\d{2})\.(jpeg|mp4|jpg)/i,
        extract: (match) => new Date(
          parseInt(match[1]), // year
          parseInt(match[2]) - 1, // month (0-indexed)
          parseInt(match[3]), // day
          parseInt(match[4]), // hour
          parseInt(match[5]), // minute
          parseInt(match[6])  // second
        )
      },
      {
        name: 'Screenshot',
        regex: /Screenshot (\d{4})-(\d{2})-(\d{2}) at (\d{2})\.(\d{2})\.(\d{2})\.(png|jpg|jpeg)/i,
        extract: (match) => new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        )
      },
      {
        name: 'Google Pixel',
        regex: /PXL_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\d{3}\.(jpg|mp4)/i,
        extract: (match) => new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        )
      },
      {
        name: 'Android',
        regex: /IMG_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.jpg/i,
        extract: (match) => new Date(
          parseInt(match[1]),
          parseInt(match[2]) - 1,
          parseInt(match[3]),
          parseInt(match[4]),
          parseInt(match[5]),
          parseInt(match[6])
        )
      }
    ];
  }

  /**
   * Extract date from file using 4-level fallback chain
   * @param {string} filePath - Full path to the file
   * @param {string} filename - Original filename
   * @returns {Object} { date: Date, source: string }
   */
  extractDate(filePath, filename) {
    // Level 1: Try EXIF metadata
    const exifDate = this.extractFromEXIF(filePath);
    if (exifDate) {
      return { date: exifDate, source: 'exif' };
    }

    // Level 2: Try filename regex patterns
    const filenameDate = this.extractFromFilename(filename);
    if (filenameDate) {
      return { date: filenameDate.date, source: `filename_${filenameDate.pattern}` };
    }

    // Level 3: Try file mtime
    const mtimeDate = this.extractFromMtime(filePath);
    if (mtimeDate) {
      return { date: mtimeDate, source: 'mtime' };
    }

    // Level 4: Use current date as last resort
    return { date: new Date(), source: 'current' };
  }

  /**
   * Level 1: Extract date from EXIF metadata
   * Note: WhatsApp files have NO EXIF metadata
   */
  extractFromEXIF(filePath) {
    try {
      const buffer = fs.readFileSync(filePath);
      const parser = exifParser.create(buffer);
      const result = parser.parse();

      if (result.tags && result.tags.DateTimeOriginal) {
        return new Date(result.tags.DateTimeOriginal * 1000);
      }

      if (result.tags && result.tags.DateTime) {
        return new Date(result.tags.DateTime * 1000);
      }

      return null;
    } catch (error) {
      // EXIF parsing failed or not available
      return null;
    }
  }

  /**
   * Level 2: Extract date from filename using regex patterns
   * CRITICAL: This is the ONLY way to extract dates from WhatsApp files
   */
  extractFromFilename(filename) {
    for (const pattern of this.patterns) {
      const match = filename.match(pattern.regex);
      if (match) {
        try {
          const date = pattern.extract(match);
          if (date && !isNaN(date.getTime())) {
            return { date, pattern: pattern.name.toLowerCase() };
          }
        } catch (error) {
          // Pattern matched but date extraction failed
          continue;
        }
      }
    }
    return null;
  }

  /**
   * Level 3: Extract date from file modification time
   */
  extractFromMtime(filePath) {
    try {
      const stats = fs.statSync(filePath);
      return stats.mtime;
    } catch (error) {
      return null;
    }
  }

  /**
   * Format date for directory structure: YYYY/MM
   */
  formatDateForPath(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}/${month}`;
  }

  /**
   * Format date for ISO string storage
   */
  formatDateForStorage(date) {
    return date.toISOString();
  }
}

module.exports = DateExtractor;

// Made with Bob

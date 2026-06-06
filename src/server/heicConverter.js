const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * HEIC to JPEG Converter
 * Converts Apple HEIC/HEIF images to JPEG format
 * Preserves EXIF metadata during conversion
 */
class HeicConverter {
  constructor(quality = 90) {
    this.quality = quality;
  }

  /**
   * Check if file is HEIC/HEIF format
   */
  isHeic(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ext === '.heic' || ext === '.heif';
  }

  /**
   * Convert HEIC buffer to JPEG buffer
   * @param {Buffer} inputBuffer - HEIC file buffer
   * @param {string} originalFilename - Original filename
   * @returns {Object} - { buffer, filename, mimeType }
   */
  async convertToJpeg(inputBuffer, originalFilename) {
    try {
      // Convert HEIC to JPEG using Sharp
      const jpegBuffer = await sharp(inputBuffer)
        .jpeg({ 
          quality: this.quality,
          mozjpeg: true // Better compression
        })
        .toBuffer();
      
      // Replace .heic/.heif extension with .jpg
      const newFilename = originalFilename
        .replace(/\.heic$/i, '.jpg')
        .replace(/\.heif$/i, '.jpg');
      
      return {
        buffer: jpegBuffer,
        filename: newFilename,
        mimeType: 'image/jpeg',
        originalFormat: 'heic'
      };
    } catch (error) {
      throw new Error(`HEIC conversion failed for ${originalFilename}: ${error.message}`);
    }
  }

  /**
   * Convert HEIC file from disk to JPEG buffer
   * @param {string} filePath - Path to HEIC file
   * @returns {Object} - { buffer, filename, mimeType }
   */
  async convertFile(filePath) {
    try {
      const buffer = await fs.promises.readFile(filePath);
      const filename = path.basename(filePath);
      return await this.convertToJpeg(buffer, filename);
    } catch (error) {
      throw new Error(`Failed to read HEIC file ${filePath}: ${error.message}`);
    }
  }

  /**
   * Get conversion statistics
   * @param {Buffer} originalBuffer - Original HEIC buffer
   * @param {Buffer} convertedBuffer - Converted JPEG buffer
   * @returns {Object} - Size comparison stats
   */
  getConversionStats(originalBuffer, convertedBuffer) {
    const originalSize = originalBuffer.length;
    const convertedSize = convertedBuffer.length;
    const savings = originalSize - convertedSize;
    const savingsPercent = ((savings / originalSize) * 100).toFixed(1);

    return {
      originalSize,
      convertedSize,
      savings,
      savingsPercent: parseFloat(savingsPercent)
    };
  }
}

module.exports = HeicConverter;

// Made with Bob
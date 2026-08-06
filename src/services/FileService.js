/**
 * File Service
 * 
 * Manages local file storage for media files (photos, videos, audio).
 * Handles:
 * - Saving captured media to app's document directory
 * - Generating thumbnails for videos
 * - Cleaning up old/orphaned files
 * - File path management
 */

import * as FileSystem from 'expo-file-system/legacy';
import { v4 as uuidv4 } from 'uuid';

// Base directory for all app media files
const MEDIA_DIR = `${FileSystem.documentDirectory}media/`;
const PHOTOS_DIR = `${MEDIA_DIR}photos/`;
const VIDEOS_DIR = `${MEDIA_DIR}videos/`;
const AUDIO_DIR = `${MEDIA_DIR}audio/`;
const THUMBNAILS_DIR = `${MEDIA_DIR}thumbnails/`;
const CACHE_DIR = `${FileSystem.cacheDirectory}footprint/`;

/**
 * Media types supported
 */
export const MediaType = {
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
};

/**
 * File extensions by type
 */
const EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic'],
  video: ['.mp4', '.mov', '.avi', '.webm', '.mkv'],
  audio: ['.mp3', '.wav', '.m4a', '.aac', '.ogg'],
};

class FileServiceClass {
  constructor() {
    this.initialized = false;
  }

  // ============================================================
  // Initialization
  // ============================================================

  /**
   * Initialize the file service - create necessary directories
   */
  async initialize() {
    if (this.initialized) return;

    console.log('[FileService] Initializing...');

    // Create all necessary directories
    const dirs = [MEDIA_DIR, PHOTOS_DIR, VIDEOS_DIR, AUDIO_DIR, THUMBNAILS_DIR, CACHE_DIR];
    
    for (const dir of dirs) {
      const info = await FileSystem.getInfoAsync(dir);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        console.log(`[FileService] Created directory: ${dir}`);
      }
    }

    this.initialized = true;
    console.log('[FileService] Initialized');
  }

  /**
   * Ensure service is initialized before operations
   */
  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  // ============================================================
  // Directory Paths
  // ============================================================

  /**
   * Get the directory for a media type
   * @param {string} mediaType - Type of media (image, video, audio)
   * @returns {string} Directory path
   */
  getMediaDirectory(mediaType) {
    switch (mediaType) {
      case MediaType.IMAGE:
        return PHOTOS_DIR;
      case MediaType.VIDEO:
        return VIDEOS_DIR;
      case MediaType.AUDIO:
        return AUDIO_DIR;
      default:
        return MEDIA_DIR;
    }
  }

  /**
   * Get the thumbnails directory
   * @returns {string} Thumbnails directory path
   */
  getThumbnailsDirectory() {
    return THUMBNAILS_DIR;
  }

  /**
   * Get the cache directory
   * @returns {string} Cache directory path
   */
  getCacheDirectory() {
    return CACHE_DIR;
  }

  // ============================================================
  // File Operations
  // ============================================================

  /**
   * Generate a unique filename for a media file
   * @param {string} mediaType - Type of media
   * @param {string} originalExtension - Original file extension (optional)
   * @returns {string} Unique filename
   */
  generateFilename(mediaType, originalExtension = null) {
    const timestamp = Date.now();
    const uuid = uuidv4().substring(0, 8);
    
    // Determine extension
    let extension = originalExtension;
    if (!extension) {
      switch (mediaType) {
        case MediaType.IMAGE:
          extension = '.jpg';
          break;
        case MediaType.VIDEO:
          extension = '.mp4';
          break;
        case MediaType.AUDIO:
          extension = '.m4a';
          break;
        default:
          extension = '';
      }
    }
    
    // Ensure extension starts with dot
    if (extension && !extension.startsWith('.')) {
      extension = '.' + extension;
    }
    
    return `${timestamp}_${uuid}${extension}`;
  }

  /**
   * Save a file from a source URI to the app's media directory
   * @param {string} sourceUri - Source file URI (can be file://, content://, etc.)
   * @param {string} mediaType - Type of media (image, video, audio)
   * @param {string} filename - Optional filename (will generate if not provided)
   * @returns {Promise<object>} { localPath, filename, size }
   */
  async saveFile(sourceUri, mediaType, filename = null) {
    await this.ensureInitialized();

    // Generate filename if not provided
    const finalFilename = filename || this.generateFilename(mediaType, this.getExtension(sourceUri));
    
    // Get destination directory
    const destDir = this.getMediaDirectory(mediaType);
    const destPath = `${destDir}${finalFilename}`;

    console.log(`[FileService] Saving file: ${sourceUri} -> ${destPath}`);

    try {
      // Copy file to our directory
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
      });

      // Get file info
      const fileInfo = await FileSystem.getInfoAsync(destPath);

      return {
        localPath: destPath,
        filename: finalFilename,
        size: fileInfo.size || 0,
      };
    } catch (error) {
      console.error('[FileService] Error saving file:', error);
      throw error;
    }
  }

  /**
   * Save audio recording from expo-av
   * @param {string} recordingUri - Recording URI from expo-av
   * @returns {Promise<object>} { localPath, filename, size }
   */
  async saveAudioRecording(recordingUri) {
    return this.saveFile(recordingUri, MediaType.AUDIO);
  }

  /**
   * Save photo from camera
   * @param {string} photoUri - Photo URI from expo-camera
   * @returns {Promise<object>} { localPath, filename, size }
   */
  async savePhoto(photoUri) {
    return this.saveFile(photoUri, MediaType.IMAGE);
  }

  /**
   * Whether a URI already points inside the app's permanent media directory.
   *
   * Camera and image-picker URIs live in the OS cache, which is purged without
   * warning -- storing one in an entry yields a broken image later. Callers use
   * this to avoid re-copying a file that has already been persisted.
   *
   * @param {string} uri
   * @returns {boolean}
   */
  isPersisted(uri) {
    return typeof uri === 'string' && uri.startsWith(MEDIA_DIR);
  }

  /**
   * Copy a captured file into permanent storage unless it is already there.
   * Returns the durable URI to store on the entry.
   *
   * @param {string} uri - source URI (may be a cache path)
   * @param {string} type - MediaType value
   * @returns {Promise<string>} durable local URI
   */
  async persist(uri, type) {
    if (!uri || this.isPersisted(uri)) return uri;
    const saved = await this.saveFile(uri, type);
    return saved.localPath;
  }

  /**
   * Save video from camera
   * @param {string} videoUri - Video URI from expo-camera
   * @returns {Promise<object>} { localPath, filename, size }
   */
  async saveVideo(videoUri) {
    return this.saveFile(videoUri, MediaType.VIDEO);
  }

  /**
   * Save a thumbnail image
   * @param {string} sourceUri - Source thumbnail URI
   * @param {string} originalFilename - Original media filename (for naming)
   * @returns {Promise<object>} { localPath, filename, size }
   */
  async saveThumbnail(sourceUri, originalFilename) {
    await this.ensureInitialized();

    // Generate thumbnail filename based on original
    const baseName = originalFilename.replace(/\.[^/.]+$/, '');
    const thumbnailFilename = `${baseName}_thumb.jpg`;
    const destPath = `${THUMBNAILS_DIR}${thumbnailFilename}`;

    try {
      await FileSystem.copyAsync({
        from: sourceUri,
        to: destPath,
      });

      const fileInfo = await FileSystem.getInfoAsync(destPath);

      return {
        localPath: destPath,
        filename: thumbnailFilename,
        size: fileInfo.size || 0,
      };
    } catch (error) {
      console.error('[FileService] Error saving thumbnail:', error);
      throw error;
    }
  }

  /**
   * Delete a file
   * @param {string} filePath - Path to file to delete
   */
  async deleteFile(filePath) {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      if (info.exists) {
        await FileSystem.deleteAsync(filePath);
        console.log(`[FileService] Deleted: ${filePath}`);
      }
    } catch (error) {
      console.error('[FileService] Error deleting file:', error);
      // Don't throw - deletion failures are usually not critical
    }
  }

  /**
   * Delete multiple files
   * @param {Array<string>} filePaths - Paths to files to delete
   */
  async deleteFiles(filePaths) {
    await Promise.all(filePaths.map(path => this.deleteFile(path)));
  }

  /**
   * Check if a file exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>} True if exists
   */
  async fileExists(filePath) {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists;
    } catch {
      return false;
    }
  }

  /**
   * Get file info
   * @param {string} filePath - Path to file
   * @returns {Promise<object|null>} File info or null
   */
  async getFileInfo(filePath) {
    try {
      const info = await FileSystem.getInfoAsync(filePath);
      return info.exists ? info : null;
    } catch {
      return null;
    }
  }

  /**
   * Get file size in human-readable format
   * @param {number} bytes - File size in bytes
   * @returns {string} Human-readable size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // ============================================================
  // File Reading
  // ============================================================

  /**
   * Read a file as base64
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} Base64 encoded content
   */
  async readAsBase64(filePath) {
    return FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  /**
   * Read a file as string (for text files)
   * @param {string} filePath - Path to file
   * @returns {Promise<string>} File content
   */
  async readAsString(filePath) {
    return FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Get the file extension from a path or URI
   * @param {string} path - File path or URI
   * @returns {string|null} Extension (including dot) or null
   */
  getExtension(path) {
    if (!path) return null;
    
    // Remove query string if present
    const cleanPath = path.split('?')[0];
    
    const match = cleanPath.match(/\.[^./]+$/);
    return match ? match[0].toLowerCase() : null;
  }

  /**
   * Get the media type from a file extension
   * @param {string} extension - File extension
   * @returns {string|null} Media type or null
   */
  getMediaTypeFromExtension(extension) {
    if (!extension) return null;
    
    const ext = extension.toLowerCase();
    
    for (const [type, exts] of Object.entries(EXTENSIONS)) {
      if (exts.includes(ext)) {
        return type;
      }
    }
    
    return null;
  }

  /**
   * Get total storage used by app media
   * @returns {Promise<object>} { total, photos, videos, audio, thumbnails }
   */
  async getStorageUsage() {
    await this.ensureInitialized();

    const calculateDirSize = async (dir) => {
      try {
        const items = await FileSystem.readDirectoryAsync(dir);
        let total = 0;
        
        for (const item of items) {
          const info = await FileSystem.getInfoAsync(`${dir}${item}`);
          if (info.exists && info.size) {
            total += info.size;
          }
        }
        
        return total;
      } catch {
        return 0;
      }
    };

    const [photos, videos, audio, thumbnails] = await Promise.all([
      calculateDirSize(PHOTOS_DIR),
      calculateDirSize(VIDEOS_DIR),
      calculateDirSize(AUDIO_DIR),
      calculateDirSize(THUMBNAILS_DIR),
    ]);

    const total = photos + videos + audio + thumbnails;

    return {
      total,
      totalFormatted: this.formatFileSize(total),
      photos,
      photosFormatted: this.formatFileSize(photos),
      videos,
      videosFormatted: this.formatFileSize(videos),
      audio,
      audioFormatted: this.formatFileSize(audio),
      thumbnails,
      thumbnailsFormatted: this.formatFileSize(thumbnails),
    };
  }

  /**
   * List all files in a media directory
   * @param {string} mediaType - Type of media
   * @returns {Promise<Array>} List of file paths
   */
  async listFiles(mediaType) {
    await this.ensureInitialized();
    
    const dir = this.getMediaDirectory(mediaType);
    
    try {
      const items = await FileSystem.readDirectoryAsync(dir);
      return items.map(item => `${dir}${item}`);
    } catch {
      return [];
    }
  }

  /**
   * Clean up cache directory
   */
  async clearCache() {
    try {
      const info = await FileSystem.getInfoAsync(CACHE_DIR);
      if (info.exists) {
        await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
        await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
      }
      console.log('[FileService] Cache cleared');
    } catch (error) {
      console.error('[FileService] Error clearing cache:', error);
    }
  }

  /**
   * Clear all media files (for app reset)
   * WARNING: This deletes all user media!
   */
  async clearAllMedia() {
    console.warn('[FileService] CLEARING ALL MEDIA FILES!');
    
    try {
      const info = await FileSystem.getInfoAsync(MEDIA_DIR);
      if (info.exists) {
        await FileSystem.deleteAsync(MEDIA_DIR, { idempotent: true });
      }
      
      // Re-initialize directories
      this.initialized = false;
      await this.initialize();
      
      console.log('[FileService] All media cleared');
    } catch (error) {
      console.error('[FileService] Error clearing media:', error);
    }
  }

  /**
   * Create a temporary file path
   * @param {string} extension - File extension
   * @returns {string} Temporary file path
   */
  getTempFilePath(extension = '.tmp') {
    const filename = `temp_${Date.now()}_${uuidv4().substring(0, 8)}${extension}`;
    return `${CACHE_DIR}${filename}`;
  }
}

// Export singleton instance
export const FileService = new FileServiceClass();
export default FileService;

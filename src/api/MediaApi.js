/**
 * Media API
 * 
 * Handles media uploads using S3 presigned URLs.
 * Supports photos, videos, and audio recordings.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { ApiClient, ApiError } from './ApiClient';
import {
  API_CONFIG,
  MEDIA_ENDPOINTS,
  buildUrl,
} from '../config/api.config';
import { NetworkMonitor } from '../sync/NetworkMonitor';

/**
 * Media types supported by the API
 */
export const MediaType = {
  PHOTO: 'photo',
  VIDEO: 'video',
  AUDIO: 'audio',
  THUMBNAIL: 'thumbnail',
};

/**
 * MIME type mappings
 */
const MIME_TYPES = {
  // Images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  
  // Videos
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  webm: 'video/webm',
  
  // Audio
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
};

/**
 * Get MIME type from file extension
 */
const getMimeType = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
};

/**
 * Media API class
 */
class MediaApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
    this._activeUploads = new Map(); // Track uploads for cancellation
  }

  // ============================================================
  // Upload Operations
  // ============================================================

  /**
   * Upload a media file to S3
   * @param {object} mediaInfo - Media information
   * @param {string} mediaInfo.localUri - Local file URI
   * @param {string} mediaInfo.type - MediaType value
   * @param {string} mediaInfo.entryId - Associated journal entry ID
   * @param {string} mediaInfo.filename - Optional filename
   * @param {function} onProgress - Progress callback (0-100)
   * @returns {Promise<object>} Upload result with server media ID and URL
   */
  async uploadMedia(mediaInfo, onProgress = null) {
    const { localUri, type, entryId, filename } = mediaInfo;

    // Check network
    const canUpload = await NetworkMonitor.shouldUploadMedia();
    if (!canUpload) {
      throw ApiError.offlineError('Cannot upload media while offline or in local-only mode');
    }

    // Get file info
    const fileInfo = await this._getFileInfo(localUri);
    if (!fileInfo.exists) {
      throw new ApiError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const actualFilename = filename || this._extractFilename(localUri);
    const mimeType = getMimeType(actualFilename);

    console.log('[MediaApi] Starting upload:', {
      type,
      filename: actualFilename,
      size: fileInfo.size,
      mimeType,
    });

    // Step 1: Request presigned upload URL from backend
    const presignedData = await this._requestUploadUrl({
      type,
      entryId,
      filename: actualFilename,
      contentType: mimeType,
      size: fileInfo.size,
    });

    // Step 2: Upload to S3 using presigned URL
    await this._uploadToS3(
      presignedData.uploadUrl,
      localUri,
      mimeType,
      fileInfo.size,
      onProgress
    );

    // Step 3: Notify backend that upload is complete
    const result = await this._completeUpload({
      uploadId: presignedData.uploadId,
      entryId,
      type,
      filename: actualFilename,
      size: fileInfo.size,
    });

    console.log('[MediaApi] Upload complete:', result);

    return {
      mediaId: result.mediaId,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
      uploadId: presignedData.uploadId,
    };
  }

  /**
   * Upload multiple media files with combined progress
   * @param {array} mediaItems - Array of media info objects
   * @param {function} onProgress - Combined progress callback
   * @returns {Promise<array>} Array of upload results
   */
  async uploadMultiple(mediaItems, onProgress = null) {
    const results = [];
    const totalItems = mediaItems.length;
    const progressPerItem = 100 / totalItems;

    for (let i = 0; i < mediaItems.length; i++) {
      const item = mediaItems[i];
      const baseProgress = i * progressPerItem;

      try {
        const result = await this.uploadMedia(item, (itemProgress) => {
          if (onProgress) {
            const totalProgress = baseProgress + (itemProgress / totalItems);
            onProgress(Math.round(totalProgress));
          }
        });

        results.push({
          ...result,
          localUri: item.localUri,
          success: true,
        });
      } catch (error) {
        console.error('[MediaApi] Upload failed for item:', item.localUri, error);
        results.push({
          localUri: item.localUri,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Cancel an active upload
   * @param {string} uploadId - Upload ID to cancel
   */
  cancelUpload(uploadId) {
    const controller = this._activeUploads.get(uploadId);
    if (controller) {
      controller.abort();
      this._activeUploads.delete(uploadId);
      console.log('[MediaApi] Upload cancelled:', uploadId);
    }
  }

  // ============================================================
  // Media Operations
  // ============================================================

  /**
   * Delete a media item
   * @param {string} mediaId - Server media ID
   */
  async deleteMedia(mediaId) {
    const url = buildUrl(this.baseUrl, MEDIA_ENDPOINTS.DELETE_MEDIA, { id: mediaId });
    
    try {
      await ApiClient.delete(url);
      return { success: true };
    } catch (error) {
      // 404 means already deleted
      if (error.status === 404) {
        return { success: true };
      }
      throw error;
    }
  }

  /**
   * Get media details
   * @param {string} mediaId - Server media ID
   */
  async getMedia(mediaId) {
    const url = buildUrl(this.baseUrl, MEDIA_ENDPOINTS.GET_MEDIA, { id: mediaId });
    return ApiClient.get(url);
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

  /**
   * Request a presigned upload URL from the backend
   */
  async _requestUploadUrl(params) {
    const url = buildUrl(this.baseUrl, MEDIA_ENDPOINTS.REQUEST_UPLOAD_URL);
    
    const response = await ApiClient.post(url, {
      mediaType: params.type,
      entryId: params.entryId,
      filename: params.filename,
      contentType: params.contentType,
      size: params.size,
    });

    return {
      uploadUrl: response.uploadUrl,
      uploadId: response.uploadId,
      expiresAt: response.expiresAt,
    };
  }

  /**
   * Upload file to S3 using presigned URL
   */
  async _uploadToS3(presignedUrl, localUri, contentType, fileSize, onProgress) {
    return new Promise(async (resolve, reject) => {
      try {
        // Use Expo FileSystem for upload with progress
        const uploadTask = FileSystem.createUploadTask(
          presignedUrl,
          localUri,
          {
            httpMethod: 'PUT',
            headers: {
              'Content-Type': contentType,
            },
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          },
          (progress) => {
            if (onProgress) {
              const percent = Math.round(
                (progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100
              );
              onProgress(percent);
            }
          }
        );

        const response = await uploadTask.uploadAsync();

        if (response.status >= 200 && response.status < 300) {
          resolve(response);
        } else {
          reject(new ApiError(
            `Upload failed with status ${response.status}`,
            response.status,
            'UPLOAD_FAILED'
          ));
        }
      } catch (error) {
        console.error('[MediaApi] S3 upload error:', error);
        reject(ApiError.networkError('Failed to upload file to storage'));
      }
    });
  }

  /**
   * Notify backend that upload is complete
   */
  async _completeUpload(params) {
    const url = buildUrl(this.baseUrl, MEDIA_ENDPOINTS.COMPLETE_UPLOAD);

    const response = await ApiClient.post(url, {
      uploadId: params.uploadId,
      entryId: params.entryId,
      mediaType: params.type,
      filename: params.filename,
      size: params.size,
    });

    return {
      mediaId: response.id,
      url: response.url,
      thumbnailUrl: response.thumbnailUrl,
    };
  }

  /**
   * Get file info from local URI
   */
  async _getFileInfo(uri) {
    try {
      const info = await FileSystem.getInfoAsync(uri);
      return info;
    } catch (error) {
      console.error('[MediaApi] Error getting file info:', error);
      return { exists: false };
    }
  }

  /**
   * Extract filename from URI
   */
  _extractFilename(uri) {
    const parts = uri.split('/');
    return parts[parts.length - 1] || 'unknown';
  }
}

// Export singleton instance
export const MediaApi = new MediaApiClass();
export default MediaApi;

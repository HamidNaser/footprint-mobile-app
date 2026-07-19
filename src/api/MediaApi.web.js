/**
 * Media API (Web variant)
 *
 * Metro resolves this file instead of MediaApi.js when the app is bundled for
 * the `web` platform. It mirrors the native MediaApi public surface but uses
 * browser `fetch` + `Blob` for file access and S3 uploads instead of
 * `expo-file-system` (which is not available on web).
 *
 * Used only for the deploy-mobile-app-as-web dev/testing build.
 */

import { ApiClient, ApiError } from './ApiClient';
import {
  API_CONFIG,
  MEDIA_ENDPOINTS,
  buildUrl,
} from '../config/api.config';

/**
 * Media types supported by the API (kept identical to the native module).
 */
export const MediaType = {
  PHOTO: 'photo',
  VIDEO: 'video',
  AUDIO: 'audio',
  THUMBNAIL: 'thumbnail',
};

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

const getMimeType = (filename) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
};

/**
 * Media API class (web)
 */
class MediaApiWebClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
    this._activeUploads = new Map(); // uploadId -> AbortController
  }

  // ============================================================
  // Upload Operations
  // ============================================================

  /**
   * Upload a media file to S3.
   * On web, `localUri` is typically a blob:/data: URL (from expo-image-picker)
   * or an http(s) URL; we fetch it to obtain the bytes.
   * @param {object} mediaInfo - { localUri, type, entryId, filename }
   * @param {function} onProgress - Progress callback (0-100)
   */
  async uploadMedia(mediaInfo, onProgress = null) {
    const { localUri, type, entryId, filename } = mediaInfo;

    // Read the file bytes as a Blob (also validates existence).
    const blob = await this._getBlob(localUri);
    if (!blob) {
      throw new ApiError('File not found', 404, 'FILE_NOT_FOUND');
    }

    const actualFilename = filename || this._extractFilename(localUri);
    const mimeType = blob.type || getMimeType(actualFilename);

    console.log('[MediaApi.web] Starting upload:', {
      type,
      filename: actualFilename,
      size: blob.size,
      mimeType,
    });

    if (onProgress) onProgress(0);

    // Step 1: Request presigned upload URL from backend
    const presignedData = await this._requestUploadUrl({
      type,
      entryId,
      filename: actualFilename,
      contentType: mimeType,
      size: blob.size,
    });

    // Step 2: Upload the blob to S3 using the presigned URL
    await this._uploadToS3(
      presignedData.uploadUrl,
      blob,
      mimeType,
      presignedData.uploadId,
    );

    if (onProgress) onProgress(100);

    // Step 3: Notify backend that upload is complete
    const result = await this._completeUpload({
      uploadId: presignedData.uploadId,
      entryId,
      type,
      filename: actualFilename,
      size: blob.size,
    });

    console.log('[MediaApi.web] Upload complete:', result);

    return {
      mediaId: result.mediaId,
      url: result.url,
      thumbnailUrl: result.thumbnailUrl,
      uploadId: presignedData.uploadId,
    };
  }

  /**
   * Upload multiple media files with combined progress.
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

        results.push({ ...result, localUri: item.localUri, success: true });
      } catch (error) {
        console.error('[MediaApi.web] Upload failed for item:', item.localUri, error);
        results.push({ localUri: item.localUri, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Cancel an active upload.
   */
  cancelUpload(uploadId) {
    const controller = this._activeUploads.get(uploadId);
    if (controller) {
      controller.abort();
      this._activeUploads.delete(uploadId);
      console.log('[MediaApi.web] Upload cancelled:', uploadId);
    }
  }

  // ============================================================
  // Media Operations
  // ============================================================

  async deleteMedia(mediaId) {
    const url = buildUrl(this.baseUrl, MEDIA_ENDPOINTS.DELETE_MEDIA, { id: mediaId });
    try {
      await ApiClient.delete(url);
      return { success: true };
    } catch (error) {
      if (error.status === 404) {
        return { success: true };
      }
      throw error;
    }
  }

  async getMedia(mediaId) {
    const url = buildUrl(this.baseUrl, MEDIA_ENDPOINTS.GET_MEDIA, { id: mediaId });
    return ApiClient.get(url);
  }

  // ============================================================
  // Private Helper Methods
  // ============================================================

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
   * Upload a Blob to S3 using the presigned URL via fetch PUT.
   * fetch has no upload-progress events, so callers get 0 -> 100 transitions.
   */
  async _uploadToS3(presignedUrl, blob, contentType, uploadId) {
    const controller = new AbortController();
    if (uploadId) this._activeUploads.set(uploadId, controller);

    try {
      const response = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: blob,
        signal: controller.signal,
      });

      if (!(response.status >= 200 && response.status < 300)) {
        throw new ApiError(
          `Upload failed with status ${response.status}`,
          response.status,
          'UPLOAD_FAILED',
        );
      }

      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('[MediaApi.web] S3 upload error:', error);
      throw ApiError.networkError('Failed to upload file to storage');
    } finally {
      if (uploadId) this._activeUploads.delete(uploadId);
    }
  }

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
   * Fetch a local/remote URI into a Blob. Returns null if it can't be read.
   */
  async _getBlob(uri) {
    try {
      const response = await fetch(uri);
      if (!response.ok && response.status !== 0) {
        return null;
      }
      return await response.blob();
    } catch (error) {
      console.error('[MediaApi.web] Error reading file blob:', error);
      return null;
    }
  }

  _extractFilename(uri) {
    const clean = uri.split('?')[0];
    const parts = clean.split('/');
    return parts[parts.length - 1] || 'upload';
  }
}

// Export singleton instance (same shape as the native module)
export const MediaApi = new MediaApiWebClass();
export default MediaApi;

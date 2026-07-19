/**
 * Reactions API
 * 
 * API client for entry reaction operations (like/unlike).
 */

import { ApiClient } from './ApiClient';
import {
  API_CONFIG,
  JOURNAL_ENDPOINTS,
  buildUrl,
} from '../config/api.config';

/**
 * Reactions API class
 */
class ReactionsApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  /**
   * Like a journal entry
   * @param {string} entryId - Entry ID to like
   * @returns {Promise<{success: boolean}>}
   */
  async likeEntry(entryId) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.LIKE_ENTRY, { id: entryId });
    await ApiClient.post(url);
    return { success: true };
  }

  /**
   * Unlike a journal entry
   * @param {string} entryId - Entry ID to unlike
   * @returns {Promise<{success: boolean}>}
   */
  async unlikeEntry(entryId) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.UNLIKE_ENTRY, { id: entryId });
    await ApiClient.delete(url);
    return { success: true };
  }

  /**
   * Toggle like on an entry
   * @param {string} entryId - Entry ID
   * @param {boolean} isCurrentlyLiked - Whether the entry is currently liked
   * @returns {Promise<{success: boolean, liked: boolean}>}
   */
  async toggleLike(entryId, isCurrentlyLiked) {
    if (isCurrentlyLiked) {
      await this.unlikeEntry(entryId);
      return { success: true, liked: false };
    } else {
      await this.likeEntry(entryId);
      return { success: true, liked: true };
    }
  }
}

export const ReactionsApi = new ReactionsApiClass();
export default ReactionsApi;

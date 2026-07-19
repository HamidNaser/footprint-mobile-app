/**
 * Comments API
 * 
 * API client for entry comment operations.
 */

import { ApiClient } from './ApiClient';
import {
  API_CONFIG,
  JOURNAL_ENDPOINTS,
  buildUrl,
} from '../config/api.config';

/**
 * Comments API class
 */
class CommentsApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  /**
   * Add a comment to a journal entry
   * @param {string} entryId - Entry ID to comment on
   * @param {string} text - Comment text
   * @returns {Promise<{id: string, author: object, text: string, createdAt: string}>}
   */
  async addComment(entryId, text) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.ADD_COMMENT, { id: entryId });
    const response = await ApiClient.post(url, { text });
    return response;
  }

  /**
   * Get comments for an entry
   * Comments are embedded in the entry response, but this method
   * can be used to refresh comments independently.
   * @param {string} entryId - Entry ID
   * @returns {Promise<Array>} Array of comments
   */
  async getComments(entryId) {
    // Comments are returned with the entry, fetch the entry
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.GET_ENTRY, { id: entryId });
    const entry = await ApiClient.get(url);
    return entry.comments || [];
  }
}

export const CommentsApi = new CommentsApiClass();
export default CommentsApi;

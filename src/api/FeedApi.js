/**
 * Feed API
 * 
 * API client for feed operations (viewing others' entries).
 */

import { ApiClient } from './ApiClient';
import {
  API_CONFIG,
  FEED_ENDPOINTS,
  buildUrl,
  buildUrlWithQuery,
} from '../config/api.config';

/**
 * Feed API class
 */
class FeedApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  /**
   * Get the main feed (self + friends' entries)
   * @param {object} options - Query parameters
   * @param {number} options.limit - Max entries to return (default 50)
   * @param {number} options.offset - Offset for pagination (default 0)
   * @param {boolean} options.includeOwn - Include own posts (default true)
   * @param {string[]} options.contentTypes - Filter by content types
   * @returns {Promise<{items: Array, totalCount: number, hasMore: boolean}>}
   */
  async getFeed(options = {}) {
    const {
      limit = 50,
      offset = 0,
      includeOwn = true,
      contentTypes,
    } = options;

    const url = buildUrl(this.baseUrl, FEED_ENDPOINTS.GET_FEED);
    const urlWithQuery = buildUrlWithQuery(url, {
      limit,
      offset,
      includeOwn,
      contentTypes: contentTypes?.join(','),
    });

    return ApiClient.get(urlWithQuery);
  }

  /**
   * Get family feed (entries from family members)
   * @param {object} options - Query parameters
   * @returns {Promise<{items: Array, totalCount: number, hasMore: boolean}>}
   */
  async getFamilyFeed(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const url = buildUrl(this.baseUrl, FEED_ENDPOINTS.GET_FAMILY_FEED);
    const urlWithQuery = buildUrlWithQuery(url, { limit, offset });

    return ApiClient.get(urlWithQuery);
  }

  /**
   * Get friends feed (entries from friends)
   * @param {object} options - Query parameters
   * @returns {Promise<{items: Array, totalCount: number, hasMore: boolean}>}
   */
  async getFriendsFeed(options = {}) {
    const { limit = 50, offset = 0 } = options;

    const url = buildUrl(this.baseUrl, FEED_ENDPOINTS.GET_FRIENDS_FEED);
    const urlWithQuery = buildUrlWithQuery(url, { limit, offset });

    return ApiClient.get(urlWithQuery);
  }

  /**
   * Get entries for a specific user (visible to current user)
   * @param {string} userId - User ID to get entries for
   * @param {object} options - Query parameters
   * @returns {Promise<{items: Array, totalCount: number, hasMore: boolean}>}
   */
  async getUserFeed(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    // Use the general feed endpoint with a filter
    // Note: Backend may need to support userId filter
    const url = buildUrl(this.baseUrl, '/feed/user/:userId', { userId });
    const urlWithQuery = buildUrlWithQuery(url, { limit, offset });

    return ApiClient.get(urlWithQuery);
  }

  /**
   * Get entries for multiple users (group feed)
   * @param {string[]} userIds - Array of user IDs
   * @param {object} options - Query parameters
   * @returns {Promise<{items: Array, totalCount: number, hasMore: boolean}>}
   */
  async getGroupFeed(userIds, options = {}) {
    const { limit = 50, offset = 0 } = options;

    // Use the general feed endpoint with userIds filter
    const url = buildUrl(this.baseUrl, FEED_ENDPOINTS.GET_FEED);
    const urlWithQuery = buildUrlWithQuery(url, {
      limit,
      offset,
      userIds: userIds.join(','),
    });

    return ApiClient.get(urlWithQuery);
  }
}

export const FeedApi = new FeedApiClass();
export default FeedApi;

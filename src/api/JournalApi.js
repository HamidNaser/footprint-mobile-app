/**
 * Journal API
 * 
 * API client for journal entry operations.
 * Handles CRUD operations and sync with the backend.
 */

import { ApiClient } from './ApiClient';
import { toDateKey } from '../utils/journalDate';
import {
  API_CONFIG,
  JOURNAL_ENDPOINTS,
  buildUrl,
  buildUrlWithQuery,
} from '../config/api.config';

/**
 * Journal API response types
 */
export const JournalApiResponseType = {
  SUCCESS: 'success',
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  CONFLICT: 'conflict',
  NOT_FOUND: 'not_found',
  ERROR: 'error',
};

/**
 * Journal API class
 */
class JournalApiClass {
  constructor() {
    this.baseUrl = API_CONFIG.HUB_BASE_URL;
  }

  // ============================================================
  // Journal Operations (parent container for entries)
  // ============================================================

  /**
   * Get list of user's journals
   * @param {object} params - Query parameters { page, limit, sortBy }
   */
  async listJournals(params = {}) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.LIST_JOURNALS);
    const urlWithQuery = buildUrlWithQuery(url, params);
    
    return ApiClient.get(urlWithQuery);
  }

  /**
   * Get a specific journal by ID
   * @param {string} journalId - Journal ID
   */
  async getJournal(journalId) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.GET_JOURNAL, { id: journalId });
    return ApiClient.get(url);
  }

  /**
   * Create a new journal
   * @param {object} data - Journal data { name, description, isPrivate }
   */
  async createJournal(data) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.CREATE_JOURNAL);
    return ApiClient.post(url, data);
  }

  /**
   * Update a journal
   * @param {string} journalId - Journal ID
   * @param {object} data - Updated journal data
   */
  async updateJournal(journalId, data) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.UPDATE_JOURNAL, { id: journalId });
    return ApiClient.put(url, data);
  }

  /**
   * Delete a journal
   * @param {string} journalId - Journal ID
   */
  async deleteJournal(journalId) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.DELETE_JOURNAL, { id: journalId });
    return ApiClient.delete(url);
  }

  // ============================================================
  // Entry Operations
  // ============================================================

  /**
   * Get entries for a journal with pagination
   * @param {string} journalId - Journal ID
   * @param {object} params - Query parameters
   */
  async listEntries(journalId, params = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      startDate,
      endDate,
      visibility,
    } = params;

    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.LIST_ENTRIES, { journalId });
    const urlWithQuery = buildUrlWithQuery(url, {
      page,
      limit,
      sortBy,
      sortOrder,
      startDate,
      endDate,
      visibility,
    });

    return ApiClient.get(urlWithQuery);
  }

  /**
   * Get a single entry by ID
   * @param {string} entryId - Entry ID
   */
  async getEntry(entryId) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.GET_ENTRY, { id: entryId });
    return ApiClient.get(url);
  }

  /**
   * Create a new journal entry
   * @param {object} entry - Entry data
   */
  async createEntry(entry) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.CREATE_ENTRY);
    
    // Format entry for API
    const payload = this._formatEntryForApi(entry);
    
    const response = await ApiClient.post(url, payload);
    return {
      type: JournalApiResponseType.CREATED,
      data: response,
      serverId: response.id,
    };
  }

  /**
   * Update an existing entry
   * @param {string} entryId - Entry server ID
   * @param {object} entry - Updated entry data
   * @param {number} lastModifiedAt - Client's last known modification time
   */
  async updateEntry(entryId, entry, lastModifiedAt = null) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.UPDATE_ENTRY, { id: entryId });
    
    const payload = this._formatEntryForApi(entry);
    
    // Add version info for conflict detection
    if (lastModifiedAt) {
      payload.lastModifiedAt = lastModifiedAt;
    }

    try {
      const response = await ApiClient.put(url, payload);
      return {
        type: JournalApiResponseType.UPDATED,
        data: response,
      };
    } catch (error) {
      // Handle conflict (409)
      if (error.status === 409) {
        return {
          type: JournalApiResponseType.CONFLICT,
          data: error.data,
          serverVersion: error.data?.serverVersion,
        };
      }
      throw error;
    }
  }

  /**
   * Delete an entry
   * @param {string} entryId - Entry server ID
   */
  async deleteEntry(entryId) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.DELETE_ENTRY, { id: entryId });
    
    try {
      await ApiClient.delete(url);
      return {
        type: JournalApiResponseType.DELETED,
      };
    } catch (error) {
      // 404 is ok - entry already deleted
      if (error.status === 404) {
        return {
          type: JournalApiResponseType.DELETED,
        };
      }
      throw error;
    }
  }

  // ============================================================
  // Sync Operations
  // ============================================================

  /**
   * Get changes since last sync
   * @param {string} lastSyncTimestamp - ISO timestamp of last sync
   * @param {string} journalId - Optional journal ID to filter
   */
  async getChanges(lastSyncTimestamp, journalId = null) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.GET_CHANGES);
    const urlWithQuery = buildUrlWithQuery(url, {
      since: lastSyncTimestamp,
      journalId,
    });

    const response = await ApiClient.get(urlWithQuery);
    
    return {
      entries: response.entries || [],
      deletedIds: response.deletedIds || [],
      serverTimestamp: response.serverTimestamp,
      hasMore: response.hasMore || false,
    };
  }

  /**
   * Batch sync multiple entries
   * @param {object} syncPayload - { creates, updates, deletes }
   */
  async batchSync(syncPayload) {
    const url = buildUrl(this.baseUrl, JOURNAL_ENDPOINTS.BATCH_SYNC);

    const payload = {
      creates: (syncPayload.creates || []).map(e => this._formatEntryForApi(e)),
      updates: (syncPayload.updates || []).map(e => ({
        ...this._formatEntryForApi(e.entry),
        serverId: e.serverId,
        lastModifiedAt: e.lastModifiedAt,
      })),
      deletes: syncPayload.deletes || [],
      clientTimestamp: new Date().toISOString(),
    };

    const response = await ApiClient.post(url, payload);

    return {
      created: response.created || [],      // Array of { localId, serverId }
      updated: response.updated || [],      // Array of serverId
      deleted: response.deleted || [],      // Array of serverId
      conflicts: response.conflicts || [],  // Array of conflict details
      serverChanges: response.serverChanges || [], // Server-side changes to pull
      serverTimestamp: response.serverTimestamp,
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Format local entry for API
   * @param {object} entry - Local entry object
   */
  _formatEntryForApi(entry) {
    // Build the nested location the Hub expects ({ lat, lng, name }), from either
    // an already-nested entry.location or legacy flat latitude/longitude fields.
    const lat = entry.location?.lat ?? entry.latitude;
    const lng = entry.location?.lng ?? entry.longitude;
    const location =
      lat != null && lng != null
        ? { lat, lng, name: entry.location?.name || entry.location_name || entry.locationName }
        : undefined;

    return {
      localId: entry.local_id || entry.localId,
      journalId: entry.journal_id || entry.journalId,
      // The calendar day the memory happened. This was missing, so the server saw
      // no date and defaulted it to year 1 -- invisible on the device that wrote
      // the entry, because the local row keeps its own date, and only wrong
      // everywhere else. Sent as YYYY-MM-DD; see src/utils/journalDate.js for why
      // it must not become an instant on the way.
      date: toDateKey(entry.date || entry.created_at || entry.createdAt),
      title: entry.title,
      contentBlocks: this._parseContentBlocks(entry.content_blocks || entry.contentBlocks),
      visibility: entry.visibility,
      mood: entry.mood,
      weather: entry.weather,
      location,
      locationSharing: entry.locationSharing || entry.location_sharing || undefined,
      tags: this._parseTags(entry.tags),
      createdAt: entry.created_at || entry.createdAt,
      updatedAt: entry.updated_at || entry.updatedAt,
    };
  }

  /**
   * Format server entry for local storage
   * @param {object} serverEntry - Server entry object
   */
  formatEntryFromApi(serverEntry) {
    return {
      server_id: serverEntry.id,
      local_id: serverEntry.localId || null,
      journal_id: serverEntry.journalId,
      title: serverEntry.title,
      content_blocks: JSON.stringify(serverEntry.contentBlocks || []),
      visibility: serverEntry.visibility,
      mood: serverEntry.mood,
      weather: serverEntry.weather,
      latitude: serverEntry.latitude,
      longitude: serverEntry.longitude,
      location_name: serverEntry.locationName,
      tags: JSON.stringify(serverEntry.tags || []),
      created_at: serverEntry.createdAt,
      updated_at: serverEntry.updatedAt,
      synced_at: new Date().toISOString(),
      sync_status: 'synced',
    };
  }

  /**
   * Parse content blocks from string or array
   */
  _parseContentBlocks(contentBlocks) {
    if (!contentBlocks) return [];
    if (Array.isArray(contentBlocks)) return contentBlocks;
    if (typeof contentBlocks === 'string') {
      try {
        return JSON.parse(contentBlocks);
      } catch {
        return [];
      }
    }
    return [];
  }

  /**
   * Parse tags from string or array
   */
  _parseTags(tags) {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags;
    if (typeof tags === 'string') {
      try {
        return JSON.parse(tags);
      } catch {
        return [];
      }
    }
    return [];
  }
}

// Export singleton instance
export const JournalApi = new JournalApiClass();
export default JournalApi;

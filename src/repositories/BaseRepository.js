/**
 * Base Repository
 * 
 * Abstract base class for data repositories.
 * Implements the Repository pattern to provide a clean abstraction
 * between business logic and data access.
 * 
 * Each entity-specific repository extends this base and implements
 * its own methods for domain-specific operations.
 */

import { DatabaseService } from '../services/DatabaseService';
import { SettingsService, StorageMode } from '../services/SettingsService';
import { SyncStatus } from '../database/schema';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base Repository class
 * Provides common functionality for all repositories
 */
export class BaseRepository {
  constructor() {
    this.dbService = DatabaseService;
    this.settingsService = SettingsService;
  }

  /**
   * Generate a new local UUID
   * @returns {string} UUID
   */
  generateLocalId() {
    return uuidv4();
  }

  /**
   * Get the current timestamp
   * @returns {number} Unix timestamp in milliseconds
   */
  now() {
    return Date.now();
  }

  /**
   * Determine the initial sync status based on storage mode
   * @returns {Promise<string>} Sync status
   */
  async getInitialSyncStatus() {
    const storageMode = await this.settingsService.getStorageMode();
    
    if (storageMode === StorageMode.LOCAL_ONLY) {
      return SyncStatus.LOCAL_ONLY;
    }
    
    return SyncStatus.PENDING;
  }

  /**
   * Check if sync is enabled
   * @returns {Promise<boolean>} True if sync is enabled
   */
  async isSyncEnabled() {
    return this.settingsService.isSyncEnabled();
  }

  /**
   * Format a Date object to ISO date string (YYYY-MM-DD)
   * @param {Date} date - Date to format
   * @returns {string} Formatted date
   */
  formatDate(date) {
    if (typeof date === 'string') return date;
    
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().split('T')[0];
  }

  /**
   * Parse a date string to Date object
   * @param {string} dateStr - Date string (YYYY-MM-DD or ISO)
   * @returns {Date} Date object
   */
  parseDate(dateStr) {
    return new Date(dateStr);
  }

  /**
   * Validate that required fields are present
   * @param {object} data - Data to validate
   * @param {Array<string>} requiredFields - Required field names
   * @throws {Error} If validation fails
   */
  validateRequired(data, requiredFields) {
    const missing = requiredFields.filter(field => {
      const value = data[field];
      return value === undefined || value === null || value === '';
    });

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
  }

  /**
   * Apply pagination to query results
   * @param {Array} items - Items to paginate
   * @param {object} options - Pagination options { limit, offset }
   * @returns {object} { items, hasMore, total }
   */
  paginate(items, options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    const total = items.length;
    const paginatedItems = items.slice(offset, offset + limit);
    const hasMore = offset + paginatedItems.length < total;

    return {
      items: paginatedItems,
      hasMore,
      total,
      offset,
      limit,
    };
  }

  /**
   * Sort items by a field
   * @param {Array} items - Items to sort
   * @param {string} field - Field to sort by
   * @param {string} order - Sort order ('ASC' or 'DESC')
   * @returns {Array} Sorted items
   */
  sortBy(items, field, order = 'DESC') {
    return [...items].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal === bVal) return 0;
      
      const comparison = aVal < bVal ? -1 : 1;
      return order === 'ASC' ? comparison : -comparison;
    });
  }

  /**
   * Filter items by a predicate
   * @param {Array} items - Items to filter
   * @param {function} predicate - Filter function
   * @returns {Array} Filtered items
   */
  filter(items, predicate) {
    return items.filter(predicate);
  }

  /**
   * Group items by a field
   * @param {Array} items - Items to group
   * @param {string} field - Field to group by
   * @returns {object} Grouped items { [fieldValue]: items[] }
   */
  groupBy(items, field) {
    return items.reduce((groups, item) => {
      const key = item[field];
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(item);
      return groups;
    }, {});
  }

  /**
   * Handle errors consistently
   * @param {string} operation - Operation name for logging
   * @param {Error} error - Error that occurred
   * @param {boolean} rethrow - Whether to rethrow the error
   */
  handleError(operation, error, rethrow = true) {
    console.error(`[${this.constructor.name}] ${operation} failed:`, error);
    
    if (rethrow) {
      throw error;
    }
  }

  /**
   * Log an operation (for debugging)
   * @param {string} operation - Operation name
   * @param {object} data - Data to log
   */
  log(operation, data = {}) {
    if (__DEV__) {
      console.log(`[${this.constructor.name}] ${operation}`, data);
    }
  }
}

export default BaseRepository;

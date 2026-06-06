/**
 * Database Web Implementation
 * 
 * Web-compatible in-memory database that mimics the expo-sqlite API.
 * Uses localStorage for persistence across page reloads.
 */

const STORAGE_KEY = 'footprint_db';

// In-memory tables
let tables = {
  journal_entries: [],
  journal_media: [],
  sync_queue: [],
  profiles: [],
  settings: [],
  schema_version: [],
};

// Load from localStorage on init
const loadFromStorage = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        tables = JSON.parse(stored);
        console.log('[WebDB] Loaded data from localStorage');
      }
    }
  } catch (e) {
    console.warn('[WebDB] Failed to load from localStorage:', e);
  }
};

// Save to localStorage
const saveToStorage = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tables));
    }
  } catch (e) {
    console.warn('[WebDB] Failed to save to localStorage:', e);
  }
};

/**
 * Mock database class for web
 */
class WebDatabase {
  constructor() {
    loadFromStorage();
  }

  /**
   * Execute SQL-like queries (simplified)
   */
  async execAsync(sql) {
    // For pragma and schema statements, just log
    console.log('[WebDB] execAsync:', sql.substring(0, 50) + '...');
    return { changes: 0 };
  }

  /**
   * Run a single query that modifies data
   */
  async runAsync(sql, params = []) {
    const sqlLower = sql.toLowerCase().trim();

    // INSERT
    if (sqlLower.startsWith('insert into')) {
      return this._handleInsert(sql, params);
    }

    // UPDATE
    if (sqlLower.startsWith('update')) {
      return this._handleUpdate(sql, params);
    }

    // DELETE
    if (sqlLower.startsWith('delete')) {
      return this._handleDelete(sql, params);
    }

    console.log('[WebDB] runAsync (unhandled):', sql.substring(0, 50));
    return { changes: 0, lastInsertRowId: 0 };
  }

  /**
   * Get all rows matching a query
   */
  async getAllAsync(sql, params = []) {
    const sqlLower = sql.toLowerCase().trim();

    // SELECT from journal_entries
    if (sqlLower.includes('from journal_entries')) {
      return this._selectFromEntries(sql, params);
    }

    // SELECT from settings
    if (sqlLower.includes('from settings')) {
      return this._selectFromSettings(sql, params);
    }

    // SELECT from profiles
    if (sqlLower.includes('from profiles')) {
      return this._selectFromProfiles(sql, params);
    }

    // SELECT from sync_queue
    if (sqlLower.includes('from sync_queue')) {
      return this._selectFromSyncQueue(sql, params);
    }

    console.log('[WebDB] getAllAsync (unhandled):', sql.substring(0, 80));
    return [];
  }

  /**
   * Get first row matching a query
   */
  async getFirstAsync(sql, params = []) {
    const results = await this.getAllAsync(sql, params);
    return results[0] || null;
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  _handleInsert(sql, params) {
    const tableName = this._extractTableName(sql);
    if (!tableName || !tables[tableName]) {
      console.warn('[WebDB] Unknown table for insert:', tableName);
      return { changes: 0, lastInsertRowId: 0 };
    }

    // Build row object from params
    const columns = this._extractInsertColumns(sql);
    const row = { _id: Date.now() };
    columns.forEach((col, i) => {
      row[col] = params[i];
    });

    tables[tableName].push(row);
    saveToStorage();

    console.log('[WebDB] Inserted into', tableName, '- total rows:', tables[tableName].length);
    return { changes: 1, lastInsertRowId: row._id };
  }

  _handleUpdate(sql, params) {
    const tableName = this._extractTableName(sql);
    if (!tableName || !tables[tableName]) {
      return { changes: 0 };
    }

    // Simple update based on local_id (most common case)
    const localIdIdx = params.length - 1;
    const localId = params[localIdIdx];

    let changes = 0;
    tables[tableName] = tables[tableName].map(row => {
      if (row.local_id === localId) {
        changes++;
        // Very simplified - just update updated_at
        return { ...row, updated_at: Date.now() };
      }
      return row;
    });

    if (changes > 0) saveToStorage();
    return { changes };
  }

  _handleDelete(sql, params) {
    const tableName = this._extractTableName(sql);
    if (!tableName || !tables[tableName]) {
      return { changes: 0 };
    }

    const localId = params[0];
    const before = tables[tableName].length;
    tables[tableName] = tables[tableName].filter(row => row.local_id !== localId);
    const changes = before - tables[tableName].length;

    if (changes > 0) saveToStorage();
    return { changes };
  }

  _selectFromEntries(sql, params) {
    let results = [...tables.journal_entries];

    // Filter by journal_id if present
    if (sql.includes('journal_id = ?')) {
      const journalId = params[0];
      results = results.filter(r => r.journal_id === journalId);
    }

    // Filter by local_id if present
    if (sql.includes('local_id = ?')) {
      const localId = params.find(p => typeof p === 'string' && p.startsWith('entry_'));
      if (localId) {
        results = results.filter(r => r.local_id === localId);
      }
    }

    // Sort by created_at DESC (default)
    results.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));

    // Apply LIMIT if present
    const limitMatch = sql.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      results = results.slice(0, limit);
    }

    return results;
  }

  _selectFromSettings(sql, params) {
    let results = [...tables.settings];

    if (sql.includes('key = ?')) {
      const key = params[0];
      results = results.filter(r => r.key === key);
    }

    return results;
  }

  _selectFromProfiles(sql, params) {
    return [...tables.profiles];
  }

  _selectFromSyncQueue(sql, params) {
    return [...tables.sync_queue];
  }

  _extractTableName(sql) {
    // INSERT INTO table_name
    let match = sql.match(/into\s+(\w+)/i);
    if (match) return match[1];

    // UPDATE table_name
    match = sql.match(/update\s+(\w+)/i);
    if (match) return match[1];

    // DELETE FROM table_name
    match = sql.match(/from\s+(\w+)/i);
    if (match) return match[1];

    return null;
  }

  _extractInsertColumns(sql) {
    const match = sql.match(/\(([^)]+)\)\s*values/i);
    if (!match) return [];
    return match[1].split(',').map(c => c.trim());
  }
}

// Singleton instance
let webDbInstance = null;

/**
 * Get or create the database instance
 * @returns {Promise<WebDatabase>} The database instance
 */
export const getDatabase = async () => {
  if (!webDbInstance) {
    console.log('[WebDB] Creating web database instance');
    webDbInstance = new WebDatabase();
  }
  return webDbInstance;
};

/**
 * Initialize the database (web version)
 * @returns {Promise<WebDatabase>} Initialized database instance
 */
export const initializeDatabase = async () => {
  const db = await getDatabase();
  console.log('[WebDB] Database initialized (web mode)');
  return db;
};

/**
 * Get database statistics (web version)
 */
export const getDatabaseStats = async () => {
  return {
    entries: tables.journal_entries.length,
    media: tables.journal_media.length,
    pendingSync: tables.sync_queue.length,
    databaseSize: JSON.stringify(tables).length,
  };
};

/**
 * Close the database (web version - no-op)
 */
export const closeDatabase = async () => {
  console.log('[WebDB] Close called (no-op on web)');
};

/**
 * Clear all data (web version)
 */
export const clearDatabase = async () => {
  tables = {
    journal_entries: [],
    journal_media: [],
    sync_queue: [],
    profiles: [],
    settings: [],
    schema_version: [],
  };
  saveToStorage();
  console.log('[WebDB] Database cleared');
};

export default { getDatabase, initializeDatabase, getDatabaseStats, closeDatabase, clearDatabase };

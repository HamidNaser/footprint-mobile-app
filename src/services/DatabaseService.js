/**
 * Database Service
 * 
 * Provides high-level database operations for the app.
 * This service wraps the raw SQLite operations with business logic
 * and provides a clean API for repositories to use.
 */

import { getDatabase, initializeDatabase, getDatabaseStats, clearDatabase } from '../database';
import { SyncStatus, UploadStatus, EntityType, SyncOperation } from '../database/schema';

class DatabaseServiceClass {
  constructor() {
    this.db = null;
    this.initialized = false;
  }

  /**
   * Initialize the database service
   * Must be called before any other operations
   */
  async initialize() {
    if (this.initialized) {
      return this.db;
    }

    this.db = await initializeDatabase();
    this.initialized = true;
    console.log('[DatabaseService] Initialized');
    return this.db;
  }

  /**
   * Get the database instance
   */
  async getDb() {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.db;
  }

  /**
   * Wipe all locally-stored data (journal entries, media queue, sync cursor,
   * cached users/comments, etc). Used on logout / account switch so no data
   * bleeds across sessions. Works on both the native and web backends.
   */
  async clearLocalData() {
    if (!this.initialized) {
      await this.initialize();
    }
    await clearDatabase();
    console.log('[DatabaseService] Local data cleared');
  }

  // ============================================================
  // Journal Entry Operations
  // ============================================================

  /**
   * Insert a new journal entry
   * @param {object} entry - Entry data
   * @returns {Promise<object>} Inserted entry
   */
  async insertEntry(entry) {
    const db = await this.getDb();
    const now = Date.now();

    const result = await db.runAsync(
      `INSERT INTO journal_entries (
        local_id, server_id, journal_id, user_id, date, content_blocks,
        location_lat, location_lng, location_name, visibility,
        reactions_likes, reactions_liked_by, comments_count,
        sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.localId,
        entry.serverId || null,
        entry.journalId,
        entry.userId,
        entry.date,
        JSON.stringify(entry.contentBlocks || []),
        entry.location?.lat || null,
        entry.location?.lng || null,
        entry.location?.name || null,
        entry.visibility || 'private',
        entry.reactions?.likes || 0,
        JSON.stringify(entry.reactions?.likedByUserIds || []),
        entry.commentsCount || 0,
        entry.syncStatus || SyncStatus.PENDING,
        entry.createdAt || now,
        now,
      ]
    );

    return { ...entry, createdAt: entry.createdAt || now, updatedAt: now };
  }

  /**
   * Update a journal entry
   * @param {string} localId - Local ID of the entry
   * @param {object} updates - Fields to update
   */
  async updateEntry(localId, updates) {
    const db = await this.getDb();
    const now = Date.now();

    const fields = [];
    const values = [];

    if (updates.serverId !== undefined) {
      fields.push('server_id = ?');
      values.push(updates.serverId);
    }
    if (updates.contentBlocks !== undefined) {
      fields.push('content_blocks = ?');
      values.push(JSON.stringify(updates.contentBlocks));
    }
    if (updates.location !== undefined) {
      fields.push('location_lat = ?', 'location_lng = ?', 'location_name = ?');
      values.push(updates.location?.lat, updates.location?.lng, updates.location?.name);
    }
    if (updates.visibility !== undefined) {
      fields.push('visibility = ?');
      values.push(updates.visibility);
    }
    if (updates.syncStatus !== undefined) {
      fields.push('sync_status = ?');
      values.push(updates.syncStatus);
    }
    if (updates.syncedAt !== undefined) {
      fields.push('synced_at = ?');
      values.push(updates.syncedAt);
    }
    if (updates.reactions !== undefined) {
      fields.push('reactions_likes = ?', 'reactions_liked_by = ?');
      values.push(updates.reactions.likes, JSON.stringify(updates.reactions.likedByUserIds || []));
    }
    if (updates.commentsCount !== undefined) {
      fields.push('comments_count = ?');
      values.push(updates.commentsCount);
    }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(localId);

    await db.runAsync(
      `UPDATE journal_entries SET ${fields.join(', ')} WHERE local_id = ?`,
      values
    );
  }

  /**
   * Get a journal entry by local ID
   * @param {string} localId - Local ID
   * @returns {Promise<object|null>} Entry or null
   */
  async getEntryByLocalId(localId) {
    const db = await this.getDb();
    const row = await db.getFirstAsync(
      'SELECT * FROM journal_entries WHERE local_id = ? AND deleted_at IS NULL',
      [localId]
    );
    return row ? this._mapEntryRow(row) : null;
  }

  /**
   * Get a journal entry by server ID
   * @param {string} serverId - Server ID
   * @returns {Promise<object|null>} Entry or null
   */
  async getEntryByServerId(serverId) {
    const db = await this.getDb();
    const row = await db.getFirstAsync(
      'SELECT * FROM journal_entries WHERE server_id = ? AND deleted_at IS NULL',
      [serverId]
    );
    return row ? this._mapEntryRow(row) : null;
  }

  /**
   * Get entries for a journal
   * @param {string} journalId - Journal ID
   * @param {object} options - Query options
   * @returns {Promise<Array>} List of entries
   */
  async getEntriesByJournalId(journalId, options = {}) {
    const db = await this.getDb();
    const { limit = 50, offset = 0, orderBy = 'date', order = 'DESC' } = options;

    const rows = await db.getAllAsync(
      `SELECT * FROM journal_entries 
       WHERE journal_id = ? AND deleted_at IS NULL 
       ORDER BY ${orderBy} ${order}
       LIMIT ? OFFSET ?`,
      [journalId, limit, offset]
    );

    return rows.map(row => this._mapEntryRow(row));
  }

  /**
   * Get entries by date
   * @param {string} date - Date in ISO format (YYYY-MM-DD)
   * @param {string} userId - User ID (optional filter)
   * @returns {Promise<Array>} List of entries
   */
  async getEntriesByDate(date, userId = null) {
    const db = await this.getDb();
    
    let query = 'SELECT * FROM journal_entries WHERE date = ? AND deleted_at IS NULL';
    const params = [date];
    
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const rows = await db.getAllAsync(query, params);
    return rows.map(row => this._mapEntryRow(row));
  }

  /**
   * Get all entries pending sync
   * @returns {Promise<Array>} List of entries needing sync
   */
  async getPendingSyncEntries() {
    const db = await this.getDb();
    const rows = await db.getAllAsync(
      `SELECT * FROM journal_entries 
       WHERE sync_status IN (?, ?) AND deleted_at IS NULL
       ORDER BY created_at ASC`,
      [SyncStatus.PENDING, SyncStatus.FAILED]
    );
    return rows.map(row => this._mapEntryRow(row));
  }

  /**
   * Soft delete an entry
   * @param {string} localId - Local ID of the entry
   */
  async deleteEntry(localId) {
    const db = await this.getDb();
    await db.runAsync(
      'UPDATE journal_entries SET deleted_at = ?, sync_status = ? WHERE local_id = ?',
      [Date.now(), SyncStatus.PENDING, localId]
    );
  }

  /**
   * Normalize media fields inside content blocks so the UI has a consistent
   * shape regardless of origin. Locally-created media use { localPath, serverUrl,
   * thumbnailUri }; server-pulled media (from /journals/changes) arrive as
   * { url, thumbnailUrl }. The rendering components read `localPath || serverUrl`
   * for the source and `thumbnailUri`/`thumbnailUrl` for previews, so mirror the
   * remote fields onto those keys here.
   */
  _normalizeContentBlocks(blocks) {
    if (!Array.isArray(blocks)) return [];
    return blocks.map((block) => {
      if (!block || !Array.isArray(block.media)) return block;
      const media = block.media.map((m) => {
        if (!m || typeof m !== 'object') return m;
        const serverUrl = m.serverUrl || m.url || null;
        const thumbnail = m.thumbnailUri || m.thumbnailUrl || m.localPath || serverUrl;
        return {
          ...m,
          serverUrl,
          url: m.url || serverUrl,
          thumbnailUrl: m.thumbnailUrl || thumbnail,
          thumbnailUri: thumbnail,
        };
      });
      return { ...block, media };
    });
  }

  /**
   * Map a database row to an entry object
   */
  _mapEntryRow(row) {
    return {
      localId: row.local_id,
      serverId: row.server_id,
      journalId: row.journal_id,
      userId: row.user_id,
      date: row.date,
      contentBlocks: this._normalizeContentBlocks(JSON.parse(row.content_blocks || '[]')),
      location: row.location_lat ? {
        lat: row.location_lat,
        lng: row.location_lng,
        name: row.location_name,
      } : null,
      visibility: row.visibility,
      reactions: {
        likes: row.reactions_likes,
        likedByUserIds: JSON.parse(row.reactions_liked_by || '[]'),
      },
      commentsCount: row.comments_count,
      syncStatus: row.sync_status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      syncedAt: row.synced_at,
      deletedAt: row.deleted_at,
    };
  }

  // ============================================================
  // Media Queue Operations
  // ============================================================

  /**
   * Add media to upload queue
   * @param {object} media - Media data
   */
  async queueMedia(media) {
    const db = await this.getDb();
    
    await db.runAsync(
      `INSERT INTO media_queue (
        local_id, entry_local_id, file_path, media_type, file_size,
        width, height, duration, thumbnail_path, upload_status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        media.localId,
        media.entryLocalId,
        media.filePath,
        media.mediaType,
        media.fileSize,
        media.width || null,
        media.height || null,
        media.duration || null,
        media.thumbnailPath || null,
        UploadStatus.PENDING,
        Date.now(),
      ]
    );
  }

  /**
   * Get pending media uploads
   * @returns {Promise<Array>} List of media needing upload
   */
  async getPendingMediaUploads() {
    const db = await this.getDb();
    const rows = await db.getAllAsync(
      `SELECT * FROM media_queue 
       WHERE upload_status IN (?, ?)
       ORDER BY created_at ASC`,
      [UploadStatus.PENDING, UploadStatus.FAILED]
    );
    return rows.map(row => this._mapMediaRow(row));
  }

  /**
   * Update media upload status
   * @param {string} localId - Local ID of the media
   * @param {object} updates - Status updates
   */
  async updateMediaStatus(localId, updates) {
    const db = await this.getDb();
    
    const fields = [];
    const values = [];

    if (updates.uploadStatus !== undefined) {
      fields.push('upload_status = ?');
      values.push(updates.uploadStatus);
    }
    if (updates.serverUrl !== undefined) {
      fields.push('server_url = ?');
      values.push(updates.serverUrl);
    }
    if (updates.thumbnailServerUrl !== undefined) {
      fields.push('thumbnail_server_url = ?');
      values.push(updates.thumbnailServerUrl);
    }
    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retryCount);
    }
    if (updates.errorMessage !== undefined) {
      fields.push('error_message = ?');
      values.push(updates.errorMessage);
    }

    if (fields.length === 0) return;

    values.push(localId);

    await db.runAsync(
      `UPDATE media_queue SET ${fields.join(', ')} WHERE local_id = ?`,
      values
    );
  }

  /**
   * Get media for an entry
   * @param {string} entryLocalId - Entry local ID
   * @returns {Promise<Array>} List of media
   */
  async getMediaForEntry(entryLocalId) {
    const db = await this.getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM media_queue WHERE entry_local_id = ?',
      [entryLocalId]
    );
    return rows.map(row => this._mapMediaRow(row));
  }

  /**
   * Map a database row to a media object
   */
  _mapMediaRow(row) {
    return {
      localId: row.local_id,
      entryLocalId: row.entry_local_id,
      filePath: row.file_path,
      mediaType: row.media_type,
      fileSize: row.file_size,
      width: row.width,
      height: row.height,
      duration: row.duration,
      serverUrl: row.server_url,
      thumbnailPath: row.thumbnail_path,
      thumbnailServerUrl: row.thumbnail_server_url,
      uploadStatus: row.upload_status,
      retryCount: row.retry_count,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    };
  }

  // ============================================================
  // Sync Metadata Operations
  // ============================================================

  /**
   * Get sync metadata value
   * @param {string} key - Metadata key
   * @returns {Promise<string|null>} Value or null
   */
  async getSyncMetadata(key) {
    const db = await this.getDb();
    const row = await db.getFirstAsync(
      'SELECT value FROM sync_metadata WHERE key = ?',
      [key]
    );
    return row?.value || null;
  }

  /**
   * Set sync metadata value
   * @param {string} key - Metadata key
   * @param {string} value - Value to store
   */
  async setSyncMetadata(key, value) {
    const db = await this.getDb();
    await db.runAsync(
      'INSERT OR REPLACE INTO sync_metadata (key, value, updated_at) VALUES (?, ?, ?)',
      [key, value, Date.now()]
    );
  }

  // ============================================================
  // Sync Queue Operations
  // ============================================================

  /**
   * Add operation to sync queue
   * @param {object} operation - Operation data
   */
  async queueSyncOperation(operation) {
    const db = await this.getDb();
    
    await db.runAsync(
      `INSERT INTO sync_queue (
        operation_type, entity_type, entity_local_id, payload, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        operation.operationType,
        operation.entityType,
        operation.entityLocalId,
        JSON.stringify(operation.payload),
        'pending',
        Date.now(),
      ]
    );
  }

  /**
   * Get pending sync operations
   * @returns {Promise<Array>} List of pending operations
   */
  async getPendingSyncOperations() {
    const db = await this.getDb();
    const rows = await db.getAllAsync(
      `SELECT * FROM sync_queue 
       WHERE status = 'pending' 
       ORDER BY created_at ASC`
    );
    return rows.map(row => ({
      id: row.id,
      operationType: row.operation_type,
      entityType: row.entity_type,
      entityLocalId: row.entity_local_id,
      payload: JSON.parse(row.payload || '{}'),
      status: row.status,
      retryCount: row.retry_count,
      lastError: row.last_error,
      createdAt: row.created_at,
      lastAttemptAt: row.last_attempt_at,
    }));
  }

  /**
   * Update sync operation status
   * @param {number} id - Operation ID
   * @param {object} updates - Status updates
   */
  async updateSyncOperation(id, updates) {
    const db = await this.getDb();
    
    const fields = [];
    const values = [];

    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.retryCount !== undefined) {
      fields.push('retry_count = ?');
      values.push(updates.retryCount);
    }
    if (updates.lastError !== undefined) {
      fields.push('last_error = ?');
      values.push(updates.lastError);
    }
    if (updates.lastAttemptAt !== undefined) {
      fields.push('last_attempt_at = ?');
      values.push(updates.lastAttemptAt);
    }

    if (fields.length === 0) return;

    values.push(id);

    await db.runAsync(
      `UPDATE sync_queue SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  /**
   * Remove completed sync operation
   * @param {number} id - Operation ID
   */
  async removeSyncOperation(id) {
    const db = await this.getDb();
    await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
  }

  // ============================================================
  // Cached Users Operations
  // ============================================================

  /**
   * Cache user data for offline access
   * @param {object} user - User data
   */
  async cacheUser(user) {
    const db = await this.getDb();
    
    await db.runAsync(
      `INSERT OR REPLACE INTO cached_users (
        user_id, name, handle, email, avatar_url, avatar_local_path,
        relationship, location_lat, location_lng, location_name,
        location_updated_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        user.userId,
        user.name,
        user.handle,
        user.email,
        user.avatarUrl,
        user.avatarLocalPath,
        user.relationship,
        user.location?.lat,
        user.location?.lng,
        user.location?.name,
        user.location?.updatedAt,
        Date.now(),
      ]
    );
  }

  /**
   * Get cached user
   * @param {string} userId - User ID
   * @returns {Promise<object|null>} User or null
   */
  async getCachedUser(userId) {
    const db = await this.getDb();
    const row = await db.getFirstAsync(
      'SELECT * FROM cached_users WHERE user_id = ?',
      [userId]
    );
    
    if (!row) return null;
    
    return {
      userId: row.user_id,
      name: row.name,
      handle: row.handle,
      email: row.email,
      avatarUrl: row.avatar_url,
      avatarLocalPath: row.avatar_local_path,
      relationship: row.relationship,
      location: row.location_lat ? {
        lat: row.location_lat,
        lng: row.location_lng,
        name: row.location_name,
        updatedAt: row.location_updated_at,
      } : null,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all cached users by relationship
   * @param {string} relationship - Relationship type (family, friend, etc.)
   * @returns {Promise<Array>} List of users
   */
  async getCachedUsersByRelationship(relationship) {
    const db = await this.getDb();
    const rows = await db.getAllAsync(
      'SELECT * FROM cached_users WHERE relationship = ?',
      [relationship]
    );
    
    return rows.map(row => ({
      userId: row.user_id,
      name: row.name,
      handle: row.handle,
      avatarUrl: row.avatar_url,
      avatarLocalPath: row.avatar_local_path,
      relationship: row.relationship,
      location: row.location_lat ? {
        lat: row.location_lat,
        lng: row.location_lng,
        name: row.location_name,
        updatedAt: row.location_updated_at,
      } : null,
    }));
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Get database statistics
   */
  async getStats() {
    return getDatabaseStats();
  }

  /**
   * Execute raw SQL (for advanced queries)
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   */
  async executeRaw(sql, params = []) {
    const db = await this.getDb();
    return db.getAllAsync(sql, params);
  }
}

// Export singleton instance
export const DatabaseService = new DatabaseServiceClass();
export default DatabaseService;

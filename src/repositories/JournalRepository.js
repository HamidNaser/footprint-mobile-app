/**
 * Journal Repository
 * 
 * Data access layer for journal entries.
 * Implements local-first CRUD operations using SQLite.
 * All writes go to local database first, then get queued for sync.
 */

import { BaseRepository } from './BaseRepository';
import { DatabaseService } from '../services/DatabaseService';
import { SyncStatus, ContentBlockType } from '../database/schema';
// Direct import (not '../sync') to avoid pulling SyncEngine and creating a cycle.
import { SyncQueue, SyncOperationType } from '../sync/SyncQueue';

/**
 * Journal Entry visibility options
 */
export const EntryVisibility = {
  PRIVATE: 'private',     // Only visible to owner
  FAMILY: 'family',       // Visible to family members
  FRIENDS: 'friends',     // Visible to friends
  PUBLIC: 'public',       // Visible to everyone
};

/**
 * Who may see a memory's EXACT coordinates. Separate from visibility, which decides who sees
 * the memory at all: anybody below this level is shown a coarsened (~1km) position instead.
 * Mirrors the backend's LocationSharingLevels and the compose screen's own picker.
 */
export const LocationSharing = {
  PRIVATE: 'private',     // Only the owner sees the exact spot
  FAMILY: 'family',       // Family see the exact spot
  EVERYONE: 'everyone',   // Anybody who can see the memory sees the exact spot
};

/**
 * Query options for fetching entries
 */
export const SortOrder = {
  NEWEST_FIRST: 'DESC',
  OLDEST_FIRST: 'ASC',
};

class JournalRepositoryClass extends BaseRepository {
  constructor() {
    super();
  }

  // ============================================================
  // Create Operations
  // ============================================================

  /**
   * Create a new journal entry (local-first)
   * @param {object} entryData - Entry data
   * @returns {Promise<object>} Created entry with local ID
   */
  async createEntry(entryData) {
    this.validateRequired(entryData, ['journalId', 'userId']);

    const localId = this.generateLocalId();
    const now = this.now();
    const syncStatus = await this.getInitialSyncStatus();

    const entry = {
      localId,
      serverId: null,
      journalId: entryData.journalId,
      userId: entryData.userId,
      // Normalised, never passed through. A caller handing over a Date object used to be
      // coerced somewhere between here and SQLite; expo-sqlite 57 rejects it outright with
      // InvalidConvertibleException, which surfaced as "entry did not save" with no clue
      // why. formatDate delegates to toDateKey, so an already-formatted YYYY-MM-DD passes
      // through untouched rather than being re-parsed as UTC midnight and losing a day.
      date: this.formatDate(entryData.date ?? new Date()),
      contentBlocks: entryData.contentBlocks || [],
      location: entryData.location || null,
      visibility: entryData.visibility || EntryVisibility.PRIVATE,
      // Who may see the exact coordinates, as picked per memory in the compose screen. The
      // same default the picker shows, and the narrowest, so a caller that says nothing
      // cannot accidentally share a position more widely than the person expected.
      locationSharing: entryData.locationSharing || LocationSharing.PRIVATE,
      reactions: { likes: 0, likedByUserIds: [] },
      commentsCount: 0,
      syncStatus,
      createdAt: now,
      updatedAt: now,
    };

    await this.dbService.insertEntry(entry);

    this.log('createEntry', { localId, date: entry.date });

    // Queue for push to the server. The local write above is authoritative;
    // this is best-effort bookkeeping and must never break local journaling.
    await this._enqueueSync(SyncOperationType.CREATE_ENTRY, localId, {
      ...entry,
      local_id: localId,
    });

    return entry;
  }

  /**
   * Create an entry with text content
   * Convenience method for simple text entries
   * @param {object} params - { journalId, userId, text, date?, visibility? }
   * @returns {Promise<object>} Created entry
   */
  async createTextEntry({ journalId, userId, text, date, visibility }) {
    const contentBlocks = [{
      type: ContentBlockType.TEXT,
      content: text,
      order: 0,
    }];

    return this.createEntry({
      journalId,
      userId,
      date,
      visibility,
      contentBlocks,
    });
  }

  /**
   * Create an entry from server data (during sync)
   * @param {object} serverEntry - Entry from server API
   * @returns {Promise<object>} Created local entry
   */
  async createFromServer(serverEntry) {
    const localId = this.generateLocalId();
    const now = this.now();

    const entry = {
      localId,
      serverId: serverEntry.id || serverEntry._id,
      journalId: serverEntry.journalId,
      userId: serverEntry.userId,
      date: serverEntry.date,
      contentBlocks: serverEntry.contentBlocks || [],
      location: serverEntry.location || null,
      visibility: serverEntry.visibility || EntryVisibility.PRIVATE,
      // Kept rather than re-derived, so a level set on another device is not lost on the way
      // in and then pushed back narrower on the next edit. A server that sends nothing falls
      // to 'private' in insertEntry, which under-shares rather than over-shares.
      locationSharing: serverEntry.locationSharing || null,
      // Kept for the same reason, and it is the step the holding-area journey turns on: a
      // person dates a box of scans "sometime in 1998", the server stores year precision, and
      // this is where it comes back down. Dropped here, the entry lands as an exact day and
      // every later read -- the detail screen and the next upload -- reports a day the person
      // never gave. A server that sends nothing falls to 'day' in insertEntry, as before.
      // Kept for the same reason, and it is the step the holding-area journey turns on: a
      // person dates a box of scans "sometime in 1998", the server stores year precision, and
      // this is where it comes back down. Dropped here, the entry lands as an exact day and
      // every later read -- the detail screen and the next upload -- reports a day the person
      // never gave. A server that sends nothing falls to 'day' in insertEntry, as before.
      datePrecision: serverEntry.datePrecision || null,
      reactions: serverEntry.reactions || { likes: 0, likedByUserIds: [] },
      commentsCount: serverEntry.commentsCount || 0,
      // The server's own `updatedAt`, kept exactly as it sent it. This is the last save the
      // server knows about, and the reference a capture moment is judged against at read time
      // (FR-029, research R2) -- a moment later than this, beyond a small tolerance for clock
      // differences, cannot be true and must not order anything. `updatedAt` below is a
      // different fact: when this phone last wrote the row, which says nothing about the
      // server. Absent, this stays null, which means no threshold rather than a threshold of
      // now.
      serverUpdatedAt: serverEntry.updatedAt || null,
      syncStatus: SyncStatus.SYNCED,
      createdAt: serverEntry.createdAt ? new Date(serverEntry.createdAt).getTime() : now,
      updatedAt: now,
      syncedAt: now,
    };

    await this.dbService.insertEntry(entry);

    this.log('createFromServer', { localId, serverId: entry.serverId });

    return entry;
  }

  // ============================================================
  // Read Operations
  // ============================================================

  /**
   * Get an entry by local ID
   * @param {string} localId - Local UUID
   * @returns {Promise<object|null>} Entry or null
   */
  async getByLocalId(localId) {
    return this.dbService.getEntryByLocalId(localId);
  }

  /**
   * Get an entry by server ID
   * @param {string} serverId - Server ID
   * @returns {Promise<object|null>} Entry or null
   */
  async getByServerId(serverId) {
    return this.dbService.getEntryByServerId(serverId);
  }

  /**
   * Get all entries for a journal
   * @param {string} journalId - Journal ID
   * @param {object} options - Query options { limit, offset, order }
   * @returns {Promise<Array>} List of entries
   */
  async getByJournalId(journalId, options = {}) {
    const { limit = 50, offset = 0, order = SortOrder.NEWEST_FIRST } = options;

    return this.dbService.getEntriesByJournalId(journalId, {
      limit,
      offset,
      orderBy: 'date',
      order,
    });
  }

  /**
   * Get entries for a specific date
   * @param {string|Date} date - Date to query
   * @param {string} userId - Optional user ID filter
   * @returns {Promise<Array>} List of entries for that date
   */
  async getByDate(date, userId = null) {
    const dateStr = this.formatDate(date);
    return this.dbService.getEntriesByDate(dateStr, userId);
  }

  /**
   * Get entries within a date range
   * @param {string|Date} startDate - Start date (inclusive)
   * @param {string|Date} endDate - End date (inclusive)
   * @param {string} journalId - Journal ID
   * @returns {Promise<Array>} List of entries
   */
  async getByDateRange(startDate, endDate, journalId) {
    const start = this.formatDate(startDate);
    const end = this.formatDate(endDate);

    const allEntries = await this.dbService.executeRaw(
      `SELECT * FROM journal_entries 
       WHERE journal_id = ? 
         AND date >= ? 
         AND date <= ? 
         AND deleted_at IS NULL
       ORDER BY date DESC, created_at DESC`,
      [journalId, start, end]
    );

    return allEntries.map(row => this._mapRow(row));
  }

  /**
   * Get recent entries (for feed/home screen)
   * @param {string} journalId - Journal ID
   * @param {number} limit - Number of entries to fetch
   * @returns {Promise<Array>} Recent entries
   */
  async getRecent(journalId, limit = 20) {
    return this.getByJournalId(journalId, { limit, order: SortOrder.NEWEST_FIRST });
  }

  /**
   * Get entries pending sync
   * @returns {Promise<Array>} Entries that need to be synced
   */
  async getPendingSync() {
    return this.dbService.getPendingSyncEntries();
  }

  /**
   * Check if an entry exists by server ID
   * @param {string} serverId - Server ID
   * @returns {Promise<boolean>} True if exists
   */
  async existsByServerId(serverId) {
    const entry = await this.getByServerId(serverId);
    return entry !== null;
  }

  /**
   * Get total count of entries for a journal
   * @param {string} journalId - Journal ID
   * @returns {Promise<number>} Count of entries
   */
  async getCount(journalId) {
    const result = await this.dbService.executeRaw(
      `SELECT COUNT(*) as count FROM journal_entries 
       WHERE journal_id = ? AND deleted_at IS NULL`,
      [journalId]
    );
    return result[0]?.count || 0;
  }

  /**
   * Get entries grouped by date
   * @param {string} journalId - Journal ID
   * @param {number} limit - Max number of entries
   * @returns {Promise<object>} Entries grouped by date { 'YYYY-MM-DD': entries[] }
   */
  async getGroupedByDate(journalId, limit = 100) {
    const entries = await this.getByJournalId(journalId, { limit });
    return this.groupBy(entries, 'date');
  }

  // ============================================================
  // Update Operations
  // ============================================================

  /**
   * Update an entry's content
   * @param {string} localId - Local ID of entry to update
   * @param {object} updates - Fields to update
   * @returns {Promise<object>} Updated entry
   */
  async update(localId, updates) {
    if (!localId) {
      throw new Error('JournalRepository.update requires a localId');
    }

    const entry = await this.getByLocalId(localId);
    if (!entry) {
      throw new Error(`Entry not found: ${localId}`);
    }

    // Prepare update data
    const updateData = {};

    if (updates.contentBlocks !== undefined) {
      updateData.contentBlocks = updates.contentBlocks;
    }
    if (updates.location !== undefined) {
      updateData.location = updates.location;
    }
    if (updates.visibility !== undefined) {
      updateData.visibility = updates.visibility;
    }
    if (updates.locationSharing !== undefined) {
      updateData.locationSharing = updates.locationSharing;
    }

    // Mark as pending sync (unless local-only)
    const syncEnabled = await this.isSyncEnabled();
    if (syncEnabled && entry.syncStatus === SyncStatus.SYNCED) {
      updateData.syncStatus = SyncStatus.PENDING;
    }

    await this.dbService.updateEntry(localId, updateData);

    this.log('update', { localId, fields: Object.keys(updateData) });

    const updated = await this.getByLocalId(localId);

    // Queue the update for push (only meaningful once the entry has a serverId).
    await this._enqueueSync(
      SyncOperationType.UPDATE_ENTRY,
      localId,
      { ...updated, local_id: localId },
      entry.serverId || null,
    );

    return updated;
  }

  /**
   * Add a content block to an entry
   * @param {string} localId - Entry local ID
   * @param {object} block - Content block to add
   * @returns {Promise<object>} Updated entry
   */
  async addContentBlock(localId, block) {
    const entry = await this.getByLocalId(localId);
    if (!entry) {
      throw new Error(`Entry not found: ${localId}`);
    }

    const contentBlocks = [...entry.contentBlocks];
    const newBlock = {
      ...block,
      order: contentBlocks.length,
    };
    contentBlocks.push(newBlock);

    return this.update(localId, { contentBlocks });
  }

  /**
   * Update sync status after successful sync
   * @param {string} localId - Local ID
   * @param {string} serverId - Server ID (if new)
   */
  async markSynced(localId, serverId = null) {
    const updates = {
      syncStatus: SyncStatus.SYNCED,
      syncedAt: this.now(),
      // The server has accepted the memory, audience and all, so whatever it last said about
      // that audience is no longer true. Cleared here rather than at each call site because
      // this is the one place both a successful create and a successful update pass through,
      // on the batch route and on the single-operation one alike -- and a card still saying
      // "Not shared" over a memory that is shared is the same silent lie as the original
      // defect, pointing the other way (research R15).
      shareState: null,
    };

    if (serverId) {
      updates.serverId = serverId;
    }

    await this.dbService.updateEntry(localId, updates);

    this.log('markSynced', { localId, serverId });
  }

  /**
   * Apply an update that originated from the server (pull/merge). Writes the
   * fields directly and marks the entry SYNCED WITHOUT re-enqueuing a push,
   * so reconciliation never triggers a sync feedback loop.
   * @param {string} localId - Local ID
   * @param {object} updates - Server fields { contentBlocks, location, visibility, updatedAt }
   */
  async applyServerUpdate(localId, updates = {}) {
    if (!localId) {
      throw new Error('JournalRepository.applyServerUpdate requires a localId');
    }

    const updateData = {};
    if (updates.contentBlocks !== undefined) updateData.contentBlocks = updates.contentBlocks;
    if (updates.location !== undefined) updateData.location = updates.location;
    if (updates.visibility !== undefined) updateData.visibility = updates.visibility;
    // The server copy's own `updatedAt`, the same ordering reference `createFromServer`
    // records (FR-029, research R2). Set only when the copy carried one, so a caller that
    // applies a partial update cannot erase a threshold that is still valid -- and in
    // particular cannot replace it with this phone's clock.
    if (updates.updatedAt !== undefined) updateData.serverUpdatedAt = updates.updatedAt;
    updateData.syncStatus = SyncStatus.SYNCED;
    updateData.syncedAt = this.now();

    await this.dbService.updateEntry(localId, updateData);

    this.log('applyServerUpdate', { localId, fields: Object.keys(updateData) });
  }

  /**
   * Record what the server last said about this memory's chosen audience.
   *
   * `'waiting'` when it could not work the audience out yet and the phone should send the
   * memory again by itself; `'refused'` when it never will and the phone must stop;
   * `null` when there is nothing to say -- the server has accepted the memory, or the person
   * has chosen an audience again.
   *
   * ⚠ **This never touches `visibility` or `locationSharing`, and nothing here ever may.**
   * It records a fact about a push that already happened; the audience itself is the person's
   * choice and stays exactly as they made it. A partial or substituted audience is the one
   * failure mode with no safe side -- narrower silently withholds the memory, wider shows it
   * to somebody it was never meant for -- so a refusal is shown, never worked around
   * (CLAUDE.md *Sharing fails closed*, FR-011, SC-010).
   *
   * No push is enqueued either, for the same reason: there is nothing new to tell the server,
   * and re-sending a memory it has just refused for good is the loop research R15 closes.
   *
   * ⚠ **And the row's local `updated_at` is left exactly as it stands.** This is bookkeeping
   * about a push that already happened, not a change the person made. It could not CREATE a
   * conflict -- `ConflictResolver.detectConflict` keys on `syncStatus` and `syncedAt` -- but it
   * could DECIDE one: the default strategy is last-write-wins, and
   * `_resolveLastWriteWins` compares this column against the server copy's `updatedAt`, so
   * stamping it on a still-PENDING memory can tip an already-detected UPDATE_UPDATE toward the
   * client and discard a newer server copy -- including a narrower audience chosen on another
   * device. That is a fail-closed concern, not a cosmetic one, so it is not stamped.
   *
   * @param {string} localId - Local ID
   * @param {string|null} state - 'waiting', 'refused', or null to clear
   */
  async setShareState(localId, state) {
    if (!localId) {
      throw new Error('JournalRepository.setShareState requires a localId');
    }

    await this.dbService.updateEntry(
      localId,
      { shareState: state ?? null },
      { touchUpdatedAt: false }
    );

    this.log('setShareState', { localId, state: state ?? null });
  }

  /**
   * Mark sync as failed
   * @param {string} localId - Local ID
   */
  async markSyncFailed(localId) {
    await this.dbService.updateEntry(localId, {
      syncStatus: SyncStatus.FAILED,
    });

    this.log('markSyncFailed', { localId });
  }

  /**
   * Update reactions on an entry
   * @param {string} localId - Entry local ID
   * @param {object} reactions - Reactions data { likes, likedByUserIds }
   */
  async updateReactions(localId, reactions) {
    await this.dbService.updateEntry(localId, { reactions });
  }

  /**
   * Update comments count
   * @param {string} localId - Entry local ID
   * @param {number} count - New comments count
   */
  async updateCommentsCount(localId, count) {
    await this.dbService.updateEntry(localId, { commentsCount: count });
  }

  // ============================================================
  // Delete Operations
  // ============================================================

  /**
   * Soft delete an entry (marks for sync)
   * @param {string} localId - Entry local ID
   */
  async delete(localId) {
    const entry = await this.getByLocalId(localId);
    if (!entry) {
      throw new Error(`Entry not found: ${localId}`);
    }

    await this.dbService.deleteEntry(localId);

    this.log('delete', { localId });

    // Queue the delete for push (only meaningful once the entry has a serverId).
    await this._enqueueSync(
      SyncOperationType.DELETE_ENTRY,
      localId,
      { local_id: localId },
      entry.serverId || null,
    );
  }

  /**
   * Enqueue a sync operation for the push side. Guarded so failures never break
   * the local-first write, and a no-op when sync is disabled (Local Only mode).
   * @private
   */
  async _enqueueSync(type, entityId, data, serverId = null) {
    try {
      if (!entityId) {
        this.log('enqueueSync skipped (missing entityId)', { type });
        return;
      }
      if (!(await this.isSyncEnabled())) return;
      await SyncQueue.enqueue({ type, entityId, serverId, data });
    } catch (error) {
      this.log('enqueueSync failed', { type, entityId, error: error.message });
    }
  }

  /**
   * Hard delete an entry (permanent, after sync confirmed)
   * @param {string} localId - Entry local ID
   */
  async hardDelete(localId) {
    const db = await this.dbService.getDb();
    await db.runAsync('DELETE FROM journal_entries WHERE local_id = ?', [localId]);

    this.log('hardDelete', { localId });
  }

  // ============================================================
  // Search Operations
  // ============================================================

  /**
   * Search entries by text content
   * @param {string} journalId - Journal ID
   * @param {string} query - Search query
   * @returns {Promise<Array>} Matching entries
   */
  async searchByText(journalId, query) {
    if (!query || query.trim().length === 0) {
      return [];
    }

    const searchTerm = `%${query.toLowerCase()}%`;
    
    const results = await this.dbService.executeRaw(
      `SELECT * FROM journal_entries 
       WHERE journal_id = ? 
         AND deleted_at IS NULL
         AND LOWER(content_blocks) LIKE ?
       ORDER BY date DESC, created_at DESC
       LIMIT 50`,
      [journalId, searchTerm]
    );

    return results.map(row => this._mapRow(row));
  }

  /**
   * Get entries with media (photos/videos/audio)
   * @param {string} journalId - Journal ID
   * @returns {Promise<Array>} Entries containing media
   */
  async getEntriesWithMedia(journalId) {
    const results = await this.dbService.executeRaw(
      `SELECT * FROM journal_entries 
       WHERE journal_id = ? 
         AND deleted_at IS NULL
         AND (content_blocks LIKE '%"type":"image"%' 
              OR content_blocks LIKE '%"type":"video"%'
              OR content_blocks LIKE '%"type":"audio"%')
       ORDER BY date DESC, created_at DESC`,
      [journalId]
    );

    return results.map(row => this._mapRow(row));
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Map a raw database row to an entry object
   * @param {object} row - Database row
   * @returns {object} Entry object
   */
  _mapRow(row) {
    return {
      localId: row.local_id,
      serverId: row.server_id,
      journalId: row.journal_id,
      userId: row.user_id,
      date: row.date,
      // How much of that date is real (FR-013c). Mapped here as well as in
      // DatabaseService._mapEntryRow: search, date ranges and entries-with-media read their
      // rows through this one, and the detail screen formats the date from it.
      datePrecision: row.date_precision,
      contentBlocks: JSON.parse(row.content_blocks || '[]'),
      location: row.location_lat ? {
        lat: row.location_lat,
        lng: row.location_lng,
        name: row.location_name,
      } : null,
      visibility: row.visibility,
      locationSharing: row.location_sharing,
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

  /**
   * Convert entry to server API format
   * @param {object} entry - Local entry
   * @returns {object} Server API format
   */
  toServerFormat(entry) {
    return {
      id: entry.serverId,
      journalId: entry.journalId,
      userId: entry.userId,
      date: entry.date,
      contentBlocks: entry.contentBlocks,
      location: entry.location,
      visibility: entry.visibility,
    };
  }
}

// Export singleton instance
export const JournalRepository = new JournalRepositoryClass();
export default JournalRepository;

/**
 * Conflict Resolver
 * 
 * Handles sync conflicts using last-write-wins strategy.
 * Also supports manual conflict resolution for important cases.
 */

import { JournalRepository } from '../repositories';
import { getDatabase } from '../database';
import { SyncStatus } from '../database/schema';

/**
 * Conflict resolution strategies
 */
export const ConflictStrategy = {
  LAST_WRITE_WINS: 'last_write_wins',   // Server or client, whichever is newer
  SERVER_WINS: 'server_wins',            // Always prefer server version
  CLIENT_WINS: 'client_wins',            // Always prefer client version
  MERGE: 'merge',                        // Try to merge changes (advanced)
  MANUAL: 'manual',                      // Require user decision
};

/**
 * Conflict types
 */
export const ConflictType = {
  UPDATE_UPDATE: 'update_update',   // Both sides modified
  DELETE_UPDATE: 'delete_update',   // Server deleted, client updated
  UPDATE_DELETE: 'update_delete',   // Client deleted, server updated
  CREATE_CREATE: 'create_create',   // Both created with same ID (rare)
};

/**
 * Conflict resolution result
 */
export const ResolutionResult = {
  RESOLVED_SERVER: 'resolved_server',
  RESOLVED_CLIENT: 'resolved_client',
  RESOLVED_MERGED: 'resolved_merged',
  REQUIRES_MANUAL: 'requires_manual',
  NO_CONFLICT: 'no_conflict',

  /**
   * The server refused the change outright and said why. Distinct from
   * REQUIRES_MANUAL, which means "the two versions disagree and a person must pick one" --
   * there is no second version here to pick from, only a reason.
   */
  SERVER_REFUSED: 'server_refused',
};

/**
 * ConflictResolver class
 */
class ConflictResolverClass {
  constructor() {
    this._defaultStrategy = ConflictStrategy.LAST_WRITE_WINS;
    this._pendingManualConflicts = new Map();
    this._listeners = new Set();
  }

  /**
   * Set the default conflict resolution strategy
   * @param {string} strategy - ConflictStrategy value
   */
  setDefaultStrategy(strategy) {
    this._defaultStrategy = strategy;
    console.log('[ConflictResolver] Default strategy set to:', strategy);
  }

  // ============================================================
  // Conflict Detection
  // ============================================================

  /**
   * Detect conflict between local and server versions
   * @param {object} localEntry - Local entry
   * @param {object} serverEntry - Server entry
   * @returns {object|null} Conflict info or null if no conflict
   */
  detectConflict(localEntry, serverEntry) {
    // No local changes since last sync - no conflict
    if (localEntry.syncStatus === SyncStatus.SYNCED) {
      return null;
    }

    // Local was deleted
    if (localEntry.syncStatus === SyncStatus.DELETED) {
      // Server was also modified
      if (new Date(serverEntry.updatedAt) > new Date(localEntry.syncedAt || localEntry.createdAt)) {
        return {
          type: ConflictType.UPDATE_DELETE,
          localEntry,
          serverEntry,
          localModified: localEntry.updatedAt,
          serverModified: serverEntry.updatedAt,
        };
      }
      return null; // Can safely delete
    }

    // Local was modified
    if (localEntry.syncStatus === SyncStatus.PENDING) {
      const localModified = new Date(localEntry.updatedAt);
      const serverModified = new Date(serverEntry.updatedAt);
      const lastSync = localEntry.syncedAt ? new Date(localEntry.syncedAt) : null;

      // Server was modified after our last sync
      if (!lastSync || serverModified > lastSync) {
        return {
          type: ConflictType.UPDATE_UPDATE,
          localEntry,
          serverEntry,
          localModified: localEntry.updatedAt,
          serverModified: serverEntry.updatedAt,
          timeDifference: Math.abs(localModified - serverModified),
        };
      }
    }

    return null;
  }

  // ============================================================
  // Conflict Resolution
  // ============================================================

  /**
   * Resolve a conflict using the configured strategy
   * @param {object} conflict - Conflict info from detectConflict
   * @param {string} strategy - Override strategy (optional)
   * @returns {Promise<object>} Resolution result
   */
  async resolveConflict(conflict, strategy = null) {
    const resolveStrategy = strategy || this._defaultStrategy;

    console.log('[ConflictResolver] Resolving conflict:', {
      type: conflict.type,
      strategy: resolveStrategy,
      localId: conflict.localEntry.localId,
    });

    switch (resolveStrategy) {
      case ConflictStrategy.LAST_WRITE_WINS:
        return this._resolveLastWriteWins(conflict);

      case ConflictStrategy.SERVER_WINS:
        return this._resolveServerWins(conflict);

      case ConflictStrategy.CLIENT_WINS:
        return this._resolveClientWins(conflict);

      case ConflictStrategy.MERGE:
        return this._resolveMerge(conflict);

      case ConflictStrategy.MANUAL:
        return this._requestManualResolution(conflict);

      default:
        return this._resolveLastWriteWins(conflict);
    }
  }

  /**
   * Resolve using last-write-wins strategy
   */
  async _resolveLastWriteWins(conflict) {
    const localTime = new Date(conflict.localModified).getTime();
    const serverTime = new Date(conflict.serverModified).getTime();

    if (localTime >= serverTime) {
      // Local is newer - keep local, push to server
      return {
        result: ResolutionResult.RESOLVED_CLIENT,
        action: 'push_local',
        entry: conflict.localEntry,
        message: 'Local changes are newer, will sync to server',
      };
    } else {
      // Server is newer - accept server version
      return this._acceptServerVersion(conflict);
    }
  }

  /**
   * Resolve by always accepting server version
   */
  async _resolveServerWins(conflict) {
    return this._acceptServerVersion(conflict);
  }

  /**
   * Resolve by always keeping client version
   */
  async _resolveClientWins(conflict) {
    return {
      result: ResolutionResult.RESOLVED_CLIENT,
      action: 'push_local',
      entry: conflict.localEntry,
      message: 'Keeping local changes, will sync to server',
    };
  }

  /**
   * Accept server version and update local database
   */
  async _acceptServerVersion(conflict) {
    const { serverEntry, localEntry } = conflict;

    // Apply server data locally and mark SYNCED WITHOUT re-enqueuing a push
    // (we are accepting the server version, not producing a new change).
    await JournalRepository.applyServerUpdate(localEntry.localId, {
      contentBlocks: serverEntry.contentBlocks || [],
      visibility: serverEntry.visibility,
    });

    return {
      result: ResolutionResult.RESOLVED_SERVER,
      action: 'accept_server',
      entry: serverEntry,
      message: 'Server changes accepted, local updated',
    };
  }

  /**
   * Attempt to merge changes (best effort)
   *
   * ⚠️ UNVERIFIED — reads fields that exist on neither shape.
   *
   * `latitude`, `longitude`, `location_name` and `tags` are on neither the object the
   * repository returns (which carries `location: {lat, lng, name}` and no tags at all) nor
   * the server entry. Each reads undefined, so a merge would quietly blank the location and
   * drop tags rather than combining anything.
   *
   * Left as it stands rather than repaired blind: MERGE is not the default strategy
   * (LAST_WRITE_WINS is, and nothing calls setStrategy), so this does not run today.
   * Rewriting conflict resolution that cannot be exercised is a good way to turn a dormant
   * bug into a live one that loses entries. Fix it when merge is actually wanted, and test
   * it against a real conflict.
   */
  async _resolveMerge(conflict) {
    const { localEntry, serverEntry } = conflict;

    // For now, implement a simple field-level merge
    // More sophisticated merging could be added later
    
    const merged = {
      // Keep server ID
      server_id: serverEntry.id || localEntry.serverId,
      local_id: localEntry.localId,
      
      // Use most recently modified title
      title: new Date(localEntry.updatedAt) > new Date(serverEntry.updatedAt)
        ? localEntry.title
        : serverEntry.title,
      
      // Merge content blocks (combine unique blocks)
      content_blocks: this._mergeContentBlocks(
        this._parseJson(localEntry.contentBlocks),
        serverEntry.contentBlocks || []
      ),
      
      // Use local visibility preference
      visibility: localEntry.visibility,
      
      // Use local mood/weather (user preference)
      mood: localEntry.mood || serverEntry.mood,
      weather: localEntry.weather || serverEntry.weather,
      
      // Use most recent location
      latitude: new Date(localEntry.updatedAt) > new Date(serverEntry.updatedAt)
        ? localEntry.latitude
        : serverEntry.latitude,
      longitude: new Date(localEntry.updatedAt) > new Date(serverEntry.updatedAt)
        ? localEntry.longitude
        : serverEntry.longitude,
      location_name: new Date(localEntry.updatedAt) > new Date(serverEntry.updatedAt)
        ? localEntry.location_name
        : serverEntry.locationName,
      
      // Combine tags
      tags: this._mergeTags(
        this._parseJson(localEntry.tags),
        serverEntry.tags || []
      ),
      
      updated_at: new Date().toISOString(),
      sync_status: SyncStatus.PENDING, // Needs to sync merged version
    };

    // Update local database with merged entry
    await JournalRepository.update(localEntry.localId, {
      ...merged,
      content_blocks: JSON.stringify(merged.content_blocks),
      tags: JSON.stringify(merged.tags),
    });

    return {
      result: ResolutionResult.RESOLVED_MERGED,
      action: 'push_merged',
      entry: merged,
      message: 'Changes merged, will sync merged version to server',
    };
  }

  /**
   * Request manual resolution from user
   */
  async _requestManualResolution(conflict) {
    const conflictId = `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this._pendingManualConflicts.set(conflictId, conflict);
    this._notifyListeners({
      type: 'conflict_pending',
      conflictId,
      conflict,
    });

    return {
      result: ResolutionResult.REQUIRES_MANUAL,
      action: 'await_user',
      conflictId,
      localEntry: conflict.localEntry,
      serverEntry: conflict.serverEntry,
      message: 'Manual resolution required',
    };
  }

  // ============================================================
  // Manual Resolution Interface
  // ============================================================

  /**
   * Get pending manual conflicts
   * @returns {array} Array of conflict info objects
   */
  getPendingConflicts() {
    return Array.from(this._pendingManualConflicts.entries()).map(([id, conflict]) => ({
      conflictId: id,
      ...conflict,
    }));
  }

  /**
   * Resolve a manual conflict with user choice
   * @param {string} conflictId - Conflict ID
   * @param {string} choice - 'local', 'server', or 'merge'
   */
  async resolveManualConflict(conflictId, choice) {
    const conflict = this._pendingManualConflicts.get(conflictId);
    if (!conflict) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    let result;
    switch (choice) {
      case 'local':
        result = await this._resolveClientWins(conflict);
        break;
      case 'server':
        result = await this._resolveServerWins(conflict);
        break;
      case 'merge':
        result = await this._resolveMerge(conflict);
        break;
      default:
        throw new Error(`Invalid choice: ${choice}`);
    }

    this._pendingManualConflicts.delete(conflictId);
    this._notifyListeners({
      type: 'conflict_resolved',
      conflictId,
      result,
    });

    return result;
  }

  /**
   * Dismiss a conflict (keep local, don't sync)
   * @param {string} conflictId - Conflict ID
   */
  dismissConflict(conflictId) {
    this._pendingManualConflicts.delete(conflictId);
    this._notifyListeners({
      type: 'conflict_dismissed',
      conflictId,
    });
  }

  // ============================================================
  // Batch Conflict Resolution
  // ============================================================

  /**
   * Normalise the conflicts a batch sync response carries.
   *
   * This reads two fields and resolves nothing, which is a deliberate narrowing of what it
   * used to attempt. Three things were wrong before:
   *
   * 1. It read `serverConflict.id` and `serverConflict.serverVersion`. The server's
   *    conflict object is `{ clientId, serverId, reason }` and has neither -- see
   *    `SyncConflict` in the Hub's `JournalDtos.cs`. So `getByServerId(undefined)` became
   *    `WHERE server_id = NULL`, matched no row, and every single refusal came back as
   *    "no conflict / local entry not found" and was then filtered away by the caller.
   * 2. `reason` -- the one field the server actually fills, with text like "Entry not
   *    found" or "Not authorized to update this entry" -- was never read at all.
   * 3. It tried to *resolve* the refusal. It cannot: a batch conflict carries no server
   *    version, so `detectConflict` had nothing to compare against (and would in fact
   *    have thrown on `serverVersion.updatedAt` the moment the id lookup started
   *    succeeding). Deciding what to do about a refusal needs either a re-fetch or a
   *    change to the contract, and neither is this function's business.
   *
   * The local lookup is gone too. The caller is pushing a queue and already holds the
   * operation each refusal belongs to, so it can correlate without a database round trip
   * -- and without the `undefined` id trap that started all this.
   *
   * The pull path's resolution machinery above (`detectConflict`, `resolveConflict` and
   * the strategies) is untouched and still used by `SyncEngine._processServerEntry`.
   *
   * @param {array} conflicts - `{ clientId, serverId, reason }` objects from the server
   * @returns {Promise<array>} one normalised refusal per conflict, in the same order
   */
  async processServerConflicts(conflicts) {
    return (conflicts || []).map((serverConflict) => ({
      // Correlates a refused create. The server sends `ServerId = string.Empty` for those,
      // so this is the only field that can identify one.
      clientId: serverConflict.clientId || null,
      // Empty string normalised to null so "no server id" is one value, not two.
      serverId: serverConflict.serverId || null,
      // The server always fills this (`Reason` is required on the DTO). The fallback is
      // only so a future contract change cannot silently produce a blank reason.
      reason: serverConflict.reason || 'The server refused this change without saying why',
      result: ResolutionResult.SERVER_REFUSED,
    }));
  }

  // ============================================================
  // Helpers
  // ============================================================

  /**
   * Merge content blocks from local and server
   * Simple strategy: combine unique blocks by their ID
   */
  _mergeContentBlocks(localBlocks, serverBlocks) {
    const merged = new Map();

    // Add server blocks first
    serverBlocks.forEach(block => {
      merged.set(block.id || JSON.stringify(block), block);
    });

    // Add/update with local blocks
    localBlocks.forEach(block => {
      const key = block.id || JSON.stringify(block);
      const existing = merged.get(key);
      
      if (!existing) {
        // New local block
        merged.set(key, block);
      } else if (block.updatedAt && existing.updatedAt) {
        // Keep newer version
        if (new Date(block.updatedAt) > new Date(existing.updatedAt)) {
          merged.set(key, block);
        }
      }
    });

    return Array.from(merged.values());
  }

  /**
   * Merge tags from local and server
   */
  _mergeTags(localTags, serverTags) {
    const tagSet = new Set([...localTags, ...serverTags]);
    return Array.from(tagSet);
  }

  /**
   * Parse JSON safely
   */
  _parseJson(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }

  // ============================================================
  // Event Listeners
  // ============================================================

  /**
   * Subscribe to conflict events
   */
  addListener(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  _notifyListeners(event) {
    this._listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('[ConflictResolver] Listener error:', error);
      }
    });
  }
}

// Export singleton instance
export const ConflictResolver = new ConflictResolverClass();
export default ConflictResolver;

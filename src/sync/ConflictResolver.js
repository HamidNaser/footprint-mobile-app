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
    if (localEntry.sync_status === SyncStatus.SYNCED) {
      return null;
    }

    // Local was deleted
    if (localEntry.sync_status === SyncStatus.DELETED) {
      // Server was also modified
      if (new Date(serverEntry.updatedAt) > new Date(localEntry.synced_at || localEntry.created_at)) {
        return {
          type: ConflictType.UPDATE_DELETE,
          localEntry,
          serverEntry,
          localModified: localEntry.updated_at,
          serverModified: serverEntry.updatedAt,
        };
      }
      return null; // Can safely delete
    }

    // Local was modified
    if (localEntry.sync_status === SyncStatus.PENDING) {
      const localModified = new Date(localEntry.updated_at);
      const serverModified = new Date(serverEntry.updatedAt);
      const lastSync = localEntry.synced_at ? new Date(localEntry.synced_at) : null;

      // Server was modified after our last sync
      if (!lastSync || serverModified > lastSync) {
        return {
          type: ConflictType.UPDATE_UPDATE,
          localEntry,
          serverEntry,
          localModified: localEntry.updated_at,
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
      localId: conflict.localEntry.local_id,
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

    // Update local entry with server data
    await JournalRepository.update(localEntry.local_id, {
      title: serverEntry.title,
      content_blocks: JSON.stringify(serverEntry.contentBlocks || []),
      visibility: serverEntry.visibility,
      mood: serverEntry.mood,
      weather: serverEntry.weather,
      latitude: serverEntry.latitude,
      longitude: serverEntry.longitude,
      location_name: serverEntry.locationName,
      tags: JSON.stringify(serverEntry.tags || []),
      updated_at: serverEntry.updatedAt,
      synced_at: new Date().toISOString(),
      sync_status: SyncStatus.SYNCED,
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
   */
  async _resolveMerge(conflict) {
    const { localEntry, serverEntry } = conflict;

    // For now, implement a simple field-level merge
    // More sophisticated merging could be added later
    
    const merged = {
      // Keep server ID
      server_id: serverEntry.id || localEntry.server_id,
      local_id: localEntry.local_id,
      
      // Use most recently modified title
      title: new Date(localEntry.updated_at) > new Date(serverEntry.updatedAt)
        ? localEntry.title
        : serverEntry.title,
      
      // Merge content blocks (combine unique blocks)
      content_blocks: this._mergeContentBlocks(
        this._parseJson(localEntry.content_blocks),
        serverEntry.contentBlocks || []
      ),
      
      // Use local visibility preference
      visibility: localEntry.visibility,
      
      // Use local mood/weather (user preference)
      mood: localEntry.mood || serverEntry.mood,
      weather: localEntry.weather || serverEntry.weather,
      
      // Use most recent location
      latitude: new Date(localEntry.updated_at) > new Date(serverEntry.updatedAt)
        ? localEntry.latitude
        : serverEntry.latitude,
      longitude: new Date(localEntry.updated_at) > new Date(serverEntry.updatedAt)
        ? localEntry.longitude
        : serverEntry.longitude,
      location_name: new Date(localEntry.updated_at) > new Date(serverEntry.updatedAt)
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
    await JournalRepository.update(localEntry.local_id, {
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
   * Process conflicts from a batch sync response
   * @param {array} conflicts - Array of conflict objects from server
   * @returns {Promise<array>} Resolution results
   */
  async processServerConflicts(conflicts) {
    const results = [];

    for (const serverConflict of conflicts) {
      // Get local entry
      const localEntry = await JournalRepository.getByServerId(serverConflict.id);
      
      if (!localEntry) {
        // Entry doesn't exist locally anymore - skip
        results.push({
          serverId: serverConflict.id,
          result: ResolutionResult.NO_CONFLICT,
          message: 'Local entry not found',
        });
        continue;
      }

      // Detect conflict type
      const conflict = this.detectConflict(localEntry, serverConflict.serverVersion);
      
      if (!conflict) {
        results.push({
          serverId: serverConflict.id,
          localId: localEntry.local_id,
          result: ResolutionResult.NO_CONFLICT,
        });
        continue;
      }

      // Resolve conflict
      const resolution = await this.resolveConflict(conflict);
      results.push({
        serverId: serverConflict.id,
        localId: localEntry.local_id,
        ...resolution,
      });
    }

    return results;
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

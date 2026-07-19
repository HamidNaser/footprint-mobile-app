/**
 * Sync Engine
 * 
 * Main orchestrator for data synchronization.
 * Coordinates between network monitor, sync queue, APIs, and conflict resolution.
 */

import { AppState } from 'react-native';
import { NetworkMonitor, NetworkState } from './NetworkMonitor';
import { SyncQueue, SyncOperationType, OperationStatus } from './SyncQueue';
import { ConflictResolver, ResolutionResult } from './ConflictResolver';
import { JournalApi } from '../api/JournalApi';
import { MediaApi } from '../api/MediaApi';
import { ApiError } from '../api/ApiClient';
import { JournalRepository } from '../repositories';
import { SettingsService, StorageMode } from '../services/SettingsService';
import { DatabaseService } from '../services/DatabaseService';
import { SyncStatus } from '../database/schema';
import { API_CONFIG } from '../config/api.config';

/**
 * Sync states
 */
export const SyncState = {
  IDLE: 'idle',
  SYNCING: 'syncing',
  PAUSED: 'paused',
  ERROR: 'error',
  OFFLINE: 'offline',
  DISABLED: 'disabled',
};

/**
 * Sync event types
 */
export const SyncEvent = {
  STATE_CHANGED: 'state_changed',
  SYNC_STARTED: 'sync_started',
  SYNC_COMPLETED: 'sync_completed',
  SYNC_FAILED: 'sync_failed',
  PROGRESS: 'progress',
  CONFLICT: 'conflict',
  ENTRY_SYNCED: 'entry_synced',
  MEDIA_UPLOADED: 'media_uploaded',
};

/**
 * SyncEngine class
 */
class SyncEngineClass {
  constructor() {
    this._state = SyncState.IDLE;
    this._isSyncing = false;
    this._syncPromise = null;
    this._listeners = new Set();
    this._lastSyncTime = null;
    this._syncInterval = null;
    this._initialized = false;
    this._appState = 'active';
    
    // Configuration
    this._config = {
      autoSyncInterval: 5 * 60 * 1000,   // 5 minutes
      maxConcurrentOperations: 3,
      enableBackgroundSync: true,
      syncOnAppResume: true,
    };
  }

  // ============================================================
  // Initialization
  // ============================================================

  /**
   * Initialize the sync engine
   */
  async initialize() {
    if (this._initialized) return;

    console.log('[SyncEngine] Initializing...');

    // Initialize network monitor
    await NetworkMonitor.initialize();

    // Set up network state listener
    NetworkMonitor.addConnectionListener(
      () => this._onOnline(),
      () => this._onOffline()
    );

    // Set up app state listener
    this._appStateSubscription = AppState.addEventListener('change', 
      (state) => this._onAppStateChange(state)
    );

    // Update initial state
    await this._updateState();

    this._initialized = true;
    console.log('[SyncEngine] Initialized, state:', this._state);
  }

  /**
   * Destroy the sync engine
   */
  destroy() {
    this.stopAutoSync();
    
    if (this._appStateSubscription) {
      this._appStateSubscription.remove();
    }

    NetworkMonitor.destroy();
    this._listeners.clear();
    this._initialized = false;
    
    console.log('[SyncEngine] Destroyed');
  }

  // ============================================================
  // State Management
  // ============================================================

  /**
   * Get current sync state
   */
  getState() {
    return this._state;
  }

  /**
   * Get last sync time
   */
  getLastSyncTime() {
    return this._lastSyncTime;
  }

  /**
   * Check if currently syncing
   */
  isSyncing() {
    return this._isSyncing;
  }

  /**
   * Update state based on conditions
   */
  async _updateState() {
    const previousState = this._state;
    
    const storageMode = await SettingsService.getStorageMode();
    
    if (storageMode === StorageMode.LOCAL_ONLY) {
      this._state = SyncState.DISABLED;
    } else if (NetworkMonitor.isOffline()) {
      this._state = SyncState.OFFLINE;
    } else if (this._isSyncing) {
      this._state = SyncState.SYNCING;
    } else {
      this._state = SyncState.IDLE;
    }

    if (previousState !== this._state) {
      this._emit(SyncEvent.STATE_CHANGED, { 
        previousState, 
        currentState: this._state 
      });
    }
  }

  // ============================================================
  // Sync Operations
  // ============================================================

  /**
   * Perform a full sync
   * @param {object} options - Sync options
   * @returns {Promise<object>} Sync result
   */
  async sync(options = {}) {
    const { force = false } = options;

    // Check if sync is allowed
    const canSync = await NetworkMonitor.shouldSync();
    if (!canSync && !force) {
      console.log('[SyncEngine] Sync not allowed in current state');
      return { success: false, reason: 'sync_not_allowed' };
    }

    // Prevent concurrent syncs
    if (this._isSyncing) {
      console.log('[SyncEngine] Sync already in progress');
      return this._syncPromise;
    }

    this._isSyncing = true;
    await this._updateState();
    this._emit(SyncEvent.SYNC_STARTED);

    this._syncPromise = this._performSync()
      .then(result => {
        this._lastSyncTime = new Date();
        this._isSyncing = false;
        this._updateState();
        this._emit(SyncEvent.SYNC_COMPLETED, result);
        return result;
      })
      .catch(error => {
        console.error('[SyncEngine] Sync failed:', error);
        this._isSyncing = false;
        this._state = SyncState.ERROR;
        this._emit(SyncEvent.SYNC_FAILED, { error: error.message });
        throw error;
      });

    return this._syncPromise;
  }

  /**
   * Perform the actual sync
   */
  async _performSync() {
    console.log('[SyncEngine] Starting sync...');
    const startTime = Date.now();
    const results = {
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: 0,
      mediaUploaded: 0,
    };

    try {
      // Step 1: Process outgoing queue (push local changes)
      const pushResult = await this._pushLocalChanges();
      results.pushed = pushResult.succeeded;
      results.errors += pushResult.failed;
      results.conflicts += pushResult.conflicts;

      // Step 2: Pull remote changes
      const pullResult = await this._pullRemoteChanges();
      results.pulled = pullResult.count;
      results.conflicts += pullResult.conflicts;

      // Step 3: Upload pending media
      const mediaResult = await this._uploadPendingMedia();
      results.mediaUploaded = mediaResult.uploaded;
      results.errors += mediaResult.failed;

      const duration = Date.now() - startTime;
      console.log('[SyncEngine] Sync completed in', duration, 'ms', results);

      return {
        success: true,
        duration,
        ...results,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Push local changes to server
   */
  async _pushLocalChanges() {
    const result = { succeeded: 0, failed: 0, conflicts: 0 };

    // Get pending operations from queue
    const operations = await SyncQueue.getPendingOperations();
    
    if (operations.length === 0) {
      console.log('[SyncEngine] No pending operations to push');
      return result;
    }

    console.log('[SyncEngine] Pushing', operations.length, 'operations');

    // Group operations for batch processing
    const creates = [];
    const updates = [];
    const deletes = [];

    for (const op of operations) {
      switch (op.type) {
        case SyncOperationType.CREATE_ENTRY:
          creates.push(op);
          break;
        case SyncOperationType.UPDATE_ENTRY:
          updates.push(op);
          break;
        case SyncOperationType.DELETE_ENTRY:
          deletes.push(op);
          break;
      }
    }

    // Try batch sync first
    try {
      const batchResult = await JournalApi.batchSync({
        creates: creates.map(op => op.data),
        updates: updates.map(op => ({
          entry: op.data,
          serverId: op.serverId,
          lastModifiedAt: op.data.updated_at,
        })),
        deletes: deletes.map(op => op.serverId).filter(Boolean),
      });

      // Process results
      for (const created of batchResult.created) {
        const op = creates.find(o => o.data.local_id === created.localId);
        if (op) {
          await this._handleCreateSuccess(op, created.serverId);
          await SyncQueue.markCompleted(op.id, { serverId: created.serverId });
          result.succeeded++;
        }
      }

      for (const serverId of batchResult.updated) {
        const op = updates.find(o => o.serverId === serverId);
        if (op) {
          await this._handleUpdateSuccess(op);
          await SyncQueue.markCompleted(op.id);
          result.succeeded++;
        }
      }

      for (const serverId of batchResult.deleted) {
        const op = deletes.find(o => o.serverId === serverId);
        if (op) {
          await SyncQueue.markCompleted(op.id);
          result.succeeded++;
        }
      }

      // Handle conflicts
      if (batchResult.conflicts && batchResult.conflicts.length > 0) {
        const conflictResults = await ConflictResolver.processServerConflicts(
          batchResult.conflicts
        );
        result.conflicts = conflictResults.filter(
          r => r.result !== ResolutionResult.NO_CONFLICT
        ).length;
      }

    } catch (error) {
      // Fall back to individual operations
      console.log('[SyncEngine] Batch sync failed, falling back to individual ops:', error.message);
      
      for (const op of operations) {
        try {
          await this._processSingleOperation(op);
          result.succeeded++;
        } catch (opError) {
          console.error('[SyncEngine] Operation failed:', op.id, opError.message);
          await SyncQueue.markFailed(op.id, opError.message);
          result.failed++;
        }
      }
    }

    return result;
  }

  /**
   * Process a single sync operation
   */
  async _processSingleOperation(operation) {
    await SyncQueue.markInProgress(operation.id);

    switch (operation.type) {
      case SyncOperationType.CREATE_ENTRY: {
        const response = await JournalApi.createEntry(operation.data);
        await this._handleCreateSuccess(operation, response.serverId);
        await SyncQueue.markCompleted(operation.id, { serverId: response.serverId });
        break;
      }

      case SyncOperationType.UPDATE_ENTRY: {
        const response = await JournalApi.updateEntry(
          operation.serverId,
          operation.data,
          operation.data.updated_at
        );
        
        if (response.type === 'conflict') {
          await this._handleConflict(operation, response);
        } else {
          await this._handleUpdateSuccess(operation);
          await SyncQueue.markCompleted(operation.id);
        }
        break;
      }

      case SyncOperationType.DELETE_ENTRY: {
        await JournalApi.deleteEntry(operation.serverId);
        await SyncQueue.markCompleted(operation.id);
        break;
      }

      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }

  /**
   * Handle successful entry creation
   */
  async _handleCreateSuccess(operation, serverId) {
    // Update local entry with server ID
    await JournalRepository.update(operation.entityId, {
      server_id: serverId,
      sync_status: SyncStatus.SYNCED,
      synced_at: new Date().toISOString(),
    });

    this._emit(SyncEvent.ENTRY_SYNCED, {
      localId: operation.entityId,
      serverId,
      action: 'created',
    });
  }

  /**
   * Handle successful entry update
   */
  async _handleUpdateSuccess(operation) {
    await JournalRepository.update(operation.entityId, {
      sync_status: SyncStatus.SYNCED,
      synced_at: new Date().toISOString(),
    });

    this._emit(SyncEvent.ENTRY_SYNCED, {
      localId: operation.entityId,
      serverId: operation.serverId,
      action: 'updated',
    });
  }

  /**
   * Handle sync conflict
   */
  async _handleConflict(operation, response) {
    const localEntry = await JournalRepository.getById(operation.entityId);
    
    const conflict = {
      type: 'update_update',
      localEntry,
      serverEntry: response.serverVersion,
      localModified: localEntry.updated_at,
      serverModified: response.serverVersion.updatedAt,
    };

    const resolution = await ConflictResolver.resolveConflict(conflict);

    if (resolution.result === ResolutionResult.REQUIRES_MANUAL) {
      await SyncQueue.markConflict(operation.id, {
        serverVersion: response.serverVersion,
        resolution: resolution,
      });
    } else if (resolution.action === 'push_local' || resolution.action === 'push_merged') {
      // Need to retry the push
      // Reset operation to pending
      await SyncQueue.markFailed(operation.id, 'Conflict resolved, needs retry');
    } else {
      // Server version accepted
      await SyncQueue.markCompleted(operation.id);
    }

    this._emit(SyncEvent.CONFLICT, {
      localId: operation.entityId,
      serverId: operation.serverId,
      resolution: resolution.result,
    });
  }

  /**
   * Pull remote changes from server
   */
  async _pullRemoteChanges() {
    const result = { count: 0, conflicts: 0 };

    // Get last sync timestamp
    const lastSyncMeta = await DatabaseService.getSyncMetadata('last_pull_timestamp');
    const lastPullTimestamp = lastSyncMeta?.value || null;

    console.log('[SyncEngine] Pulling changes since:', lastPullTimestamp);

    try {
      const changes = await JournalApi.getChanges(lastPullTimestamp);

      // Process new/updated entries
      for (const serverEntry of changes.entries) {
        await this._processServerEntry(serverEntry);
        result.count++;
      }

      // Process deletions
      for (const deletedId of changes.deletedIds) {
        const localEntry = await JournalRepository.getByServerId(deletedId);
        if (localEntry) {
          await JournalRepository.hardDelete(localEntry.local_id);
          result.count++;
        }
      }

      // Update last pull timestamp
      if (changes.serverTimestamp) {
        await DatabaseService.setSyncMetadata('last_pull_timestamp', changes.serverTimestamp);
      }

      console.log('[SyncEngine] Pulled', result.count, 'changes');
    } catch (error) {
      console.error('[SyncEngine] Pull failed:', error);
      throw error;
    }

    return result;
  }

  /**
   * Process a server entry during pull
   */
  async _processServerEntry(serverEntry) {
    // The /journals/changes payload is already camelCase and matches what the
    // repository expects (id, userId, date, contentBlocks[], location, ...).
    // Do NOT route it through JournalApi.formatEntryFromApi() — that produces
    // snake_case keys (server_id, journal_id, content_blocks) the repository
    // does not read, which would store malformed entries.
    const defaultJournalId = await SettingsService.getDefaultJournalId();
    const mapped = {
      ...serverEntry,
      // The mobile app shows a single default journal. Force pulled entries onto
      // it so they always match what JournalScreen queries (the bootstrap adopts
      // the server journal id as the default, so these usually coincide).
      journalId: defaultJournalId || serverEntry.journalId,
    };

    // Check if we have this entry locally
    const localEntry = await JournalRepository.getByServerId(serverEntry.id);

    if (!localEntry) {
      // New entry from server - create locally
      await JournalRepository.createFromServer(mapped);
      return;
    }

    // Check for conflict
    const conflict = ConflictResolver.detectConflict(localEntry, serverEntry);

    if (conflict) {
      const resolution = await ConflictResolver.resolveConflict(conflict);
      
      if (resolution.result === ResolutionResult.REQUIRES_MANUAL) {
        // Leave entry as is, user will resolve
        return;
      }
    }

    // Update local entry with server data
    if (localEntry.sync_status === SyncStatus.SYNCED || !conflict) {
      await JournalRepository.update(localEntry.local_id, {
        contentBlocks: mapped.contentBlocks,
        location: mapped.location,
        visibility: mapped.visibility,
      });
    }
  }

  /**
   * Upload pending media files
   */
  async _uploadPendingMedia() {
    const result = { uploaded: 0, failed: 0 };

    // Get pending media from queue
    const mediaQueue = await DatabaseService.getMediaQueue();
    const pending = mediaQueue.filter(m => m.status === 'pending');

    if (pending.length === 0) {
      return result;
    }

    console.log('[SyncEngine] Uploading', pending.length, 'media files');

    for (const media of pending) {
      try {
        // Mark as uploading
        await DatabaseService.updateMediaQueueItem(media.id, { status: 'uploading' });

        // Upload
        const uploadResult = await MediaApi.uploadMedia({
          localUri: media.local_uri,
          type: media.media_type,
          entryId: media.entry_id,
          filename: media.filename,
        });

        // Mark as completed
        await DatabaseService.updateMediaQueueItem(media.id, {
          status: 'completed',
          server_url: uploadResult.url,
          server_id: uploadResult.mediaId,
        });

        result.uploaded++;
        this._emit(SyncEvent.MEDIA_UPLOADED, {
          localUri: media.local_uri,
          serverUrl: uploadResult.url,
        });

      } catch (error) {
        console.error('[SyncEngine] Media upload failed:', media.id, error);
        await DatabaseService.updateMediaQueueItem(media.id, {
          status: 'failed',
          error: error.message,
        });
        result.failed++;
      }
    }

    return result;
  }

  // ============================================================
  // Auto Sync
  // ============================================================

  /**
   * Start automatic background sync
   */
  startAutoSync() {
    if (this._syncInterval) return;

    console.log('[SyncEngine] Starting auto sync every', this._config.autoSyncInterval / 1000, 's');

    this._syncInterval = setInterval(() => {
      if (this._appState === 'active') {
        this.sync().catch(e => console.log('[SyncEngine] Auto sync failed:', e.message));
      }
    }, this._config.autoSyncInterval);
  }

  /**
   * Stop automatic sync
   */
  stopAutoSync() {
    if (this._syncInterval) {
      clearInterval(this._syncInterval);
      this._syncInterval = null;
      console.log('[SyncEngine] Auto sync stopped');
    }
  }

  /**
   * Configure sync engine
   */
  configure(config) {
    Object.assign(this._config, config);
    console.log('[SyncEngine] Configuration updated:', this._config);
  }

  // ============================================================
  // Event Handlers
  // ============================================================

  _onOnline() {
    console.log('[SyncEngine] Network came online');
    this._updateState();
    
    // Trigger sync when coming online
    this.sync().catch(e => console.log('[SyncEngine] Online sync failed:', e.message));
  }

  _onOffline() {
    console.log('[SyncEngine] Network went offline');
    this._updateState();
  }

  _onAppStateChange(nextState) {
    const previousState = this._appState;
    this._appState = nextState;

    console.log('[SyncEngine] App state changed:', previousState, '->', nextState);

    if (nextState === 'active' && previousState === 'background') {
      if (this._config.syncOnAppResume) {
        this.sync().catch(e => console.log('[SyncEngine] Resume sync failed:', e.message));
      }
    }
  }

  // ============================================================
  // Event Emitter
  // ============================================================

  /**
   * Subscribe to sync events
   * @param {function} callback - Event handler(event, data)
   * @returns {function} Unsubscribe function
   */
  addListener(callback) {
    this._listeners.add(callback);
    return () => this._listeners.delete(callback);
  }

  /**
   * Subscribe to specific event type
   */
  on(eventType, callback) {
    const handler = (event, data) => {
      if (event === eventType) callback(data);
    };
    this._listeners.add(handler);
    return () => this._listeners.delete(handler);
  }

  _emit(event, data = {}) {
    this._listeners.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('[SyncEngine] Listener error:', error);
      }
    });
  }

  // ============================================================
  // Sync Status Helpers
  // ============================================================

  /**
   * Get overall sync status for UI
   */
  async getSyncStatus() {
    const state = this.getState();
    const queueStats = await SyncQueue.getStats();
    const networkStatus = await NetworkMonitor.getNetworkStatus();

    return {
      state,
      lastSync: this._lastSyncTime,
      pending: queueStats.pending + queueStats.inProgress,
      failed: queueStats.failed,
      conflicts: queueStats.conflict,
      network: networkStatus,
      canSync: networkStatus.canSync && state !== SyncState.DISABLED,
    };
  }

  /**
   * Force retry all failed operations
   */
  async retryFailed() {
    await SyncQueue.resetFailedOperations();
    return this.sync();
  }
}

// Export singleton instance
export const SyncEngine = new SyncEngineClass();
export default SyncEngine;

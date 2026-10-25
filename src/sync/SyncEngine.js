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
import { JournalService } from '../services/JournalService';
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
      // One entry per change the server refused, each carrying the server's own reason.
      // Empty on a sync where nothing was refused, which is every sync that used to
      // report a clean result whether it deserved one or not.
      conflictDetails: [],
    };

    try {
      // Step 1: Upload pending media.
      //
      // Before pushing, not after. An entry carrying a photo can only be pushed once its
      // media has a url the server can resolve -- push first and the payload still holds
      // local file paths, which the server rejects as invalid, and the entry burns a retry
      // on every sync while its media sits waiting for a step that runs afterwards.
      const mediaResult = await this._uploadPendingMedia();
      results.mediaUploaded = mediaResult.uploaded;
      results.errors += mediaResult.failed;

      // Step 2: Process outgoing queue (push local changes)
      const pushResult = await this._pushLocalChanges();
      results.pushed = pushResult.succeeded;
      results.errors += pushResult.failed;
      results.conflicts += pushResult.conflicts;
      results.conflictDetails.push(...pushResult.conflictDetails);

      // Step 3: Pull remote changes
      const pullResult = await this._pullRemoteChanges();
      results.pulled = pullResult.count;
      results.conflicts += pullResult.conflicts;

      const duration = Date.now() - startTime;
      console.log('[SyncEngine] Sync completed in', duration, 'ms', results);

      return {
        // The sync ran to completion, but a refusal is not a success: a caller that
        // checks only this field must not be told everything went through when a memory
        // was turned away. Keyed on conflicts alone, deliberately -- `errors` covers
        // transient failures that reported success before and still do, so folding them
        // in here would change the behaviour of syncs that have no conflicts at all.
        success: results.conflicts === 0,
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
    const result = { succeeded: 0, failed: 0, conflicts: 0, conflictDetails: [] };

    // Get pending operations from queue
    const operations = await this._withoutHeldEntries(
      await SyncQueue.getPendingOperations(),
      result
    );
    
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

    // Try batch sync first.
    //
    // The network call, and NOTHING else, belongs inside this try. The result processing
    // below writes to SQLite -- JournalRepository.markSynced and SyncQueue.markCompleted
    // -- and a locked database or a full disk throwing from there used to land in the
    // fallback's catch, which re-sends every operation in the batch, including the ones
    // the server had just accepted. That made a second copy on the server, and because
    // the local row then carried the retry's server id the first copy was orphaned and
    // pulled back down as a brand-new entry: two memories on the person's own phone.
    let batchResult;
    try {
      batchResult = await JournalApi.batchSync({
        creates: creates.map(op => op.data),
        updates: updates.map(op => ({
          entry: op.data,
          serverId: op.serverId,
          lastModifiedAt: op.data.updated_at,
        })),
        deletes: deletes.map(op => op.serverId).filter(Boolean),
      });
    } catch (error) {
      return await this._fallbackToSingleOperations(operations, result, error);
    }

    try {
      // Process results.
      //
      // The reply is keyed by `clientId`, not `localId` -- SyncResultItem.ClientId, which
      // the Hub's camelCase policy serialises as `clientId`. Matching on `localId` found
      // nothing, so the operation was never marked completed and the next sync pushed it
      // again, producing a duplicate memory every retry. The local column is still
      // `local_id`; only the wire name is the server's.
      for (const created of batchResult.created) {
        // A reply item with no correlation id cannot be matched to anything. Without this
        // guard `undefined === undefined` was true, so such an item matched the first
        // create that also had no `local_id` -- and two of them matched that same one
        // twice: one operation claimed and stamped with the wrong server id, the other
        // left pending forever and re-pushed, uncorrelatable, on every sync. The Hub omits
        // `clientId` rather than writing null (JsonIgnoreCondition.WhenWritingNull), so
        // the absent case is the normal one, not an exotic one.
        if (!created.clientId) {
          console.warn('[SyncEngine] Batch reply item has no clientId; cannot correlate it:', created.serverId);
          continue;
        }

        const op = creates.find(o => o.data.local_id === created.clientId);
        if (op) {
          await this._handleCreateSuccess(op, created.serverId);
          await SyncQueue.markCompleted(op.id, { serverId: created.serverId });
          result.succeeded++;
        }
      }

      // `updated` is a list of SyncResultItem objects, not of server id strings -- only
      // `deleted` below is strings. Iterating it as strings meant `o.serverId === <object>`
      // never matched, so accepted updates were re-pushed on every sync forever.
      for (const updatedItem of batchResult.updated) {
        const op = updates.find(o => o.serverId === updatedItem.serverId);
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

      // Handle conflicts -- that is, the entries the server refused.
      //
      // Every one of these must be *settled*. Left pending, the operation is picked up by
      // the next sync and the next one after that, re-sending something the server has
      // already said no to, for as long as the app is installed -- and because the refusal
      // used to be discarded, `sync()` reported a clean success throughout. A memory the
      // server would not accept sat on the phone indefinitely with nothing to show it.
      //
      // Settled as CONFLICT rather than FAILED, which is a deliberate departure from
      // "mark it failed":
      //   - `getPendingOperations()` takes PENDING, plus FAILED with retry_count < 3.
      //     CONFLICT appears in neither, so the re-sending stops immediately rather than
      //     after two more pointless round trips.
      //   - `markFailed` increments retry_count, spending a budget that exists for flaky
      //     networks. "Not authorized to update this entry" is not flaky; it will be
      //     refused identically every time.
      //   - `resetFailedOperations()` -- what `retryFailed()` calls -- resets FAILED rows
      //     back to PENDING. A refusal re-armed that way starts the loop again.
      //   - It is already visible without any new UI: `SyncQueue.getStats()` counts it,
      //     and SyncContext already folds `stats.conflict` into its failed count, which
      //     `syncBadgeStatus` renders as a failure.
      // No new column and no new status: `conflict` and `conflict_data` both already
      // exist and are already what the single-operation path uses.
      if (batchResult.conflicts && batchResult.conflicts.length > 0) {
        const refusals = await ConflictResolver.processServerConflicts(
          batchResult.conflicts
        );

        for (const refusal of refusals) {
          const op = this._findRefusedOperation(refusal, { creates, updates, deletes });

          if (op) {
            await SyncQueue.markConflict(op.id, {
              result: refusal.result,
              reason: refusal.reason,
              serverId: refusal.serverId,
              clientId: refusal.clientId,
              refusedAt: new Date().toISOString(),
            });
          } else {
            // Reported, not swallowed. A refusal we cannot tie to an operation still has
            // to be counted, or we are back to claiming a clean sync. It happens today
            // for a refused *create*: the server can only echo `ClientId`, and this client
            // sends the local id as `localId`, so it comes back null. That correlation gap
            // is PR #42's, not this change's.
            console.warn(
              '[SyncEngine] Server refused a change that matches no queued operation:',
              { clientId: refusal.clientId, serverId: refusal.serverId, reason: refusal.reason }
            );
          }

          result.conflicts++;
          result.conflictDetails.push({
            reason: refusal.reason,
            serverId: refusal.serverId,
            clientId: refusal.clientId,
            operationId: op?.id || null,
            operationType: op?.type || null,
            localId: op?.entityId || null,
            // False means the operation could not be identified, so it is still pending
            // and will be re-sent. Said out loud rather than implied.
            settled: Boolean(op),
          });

          this._emit(SyncEvent.CONFLICT, {
            localId: op?.entityId || null,
            serverId: refusal.serverId,
            reason: refusal.reason,
            resolution: refusal.result,
          });
        }
      }

    } catch (error) {
      // The batch itself was accepted; only the local bookkeeping after it failed. There
      // is deliberately no fallback here -- re-sending work the server has already done
      // is what duplicated the memory. Whatever was not marked completed stays pending,
      // and the next batch, which is idempotent on `clientId`, settles it against the
      // entry already on the server instead of making another.
      console.error(
        '[SyncEngine] Batch sync was accepted but recording it locally failed:',
        error?.message,
        '| operations left pending for the next batch'
      );
    }

    return result;
  }

  /**
   * Does this batch-sync failure prove the server never processed the request?
   *
   * Only a "yes" makes it safe to re-send a CREATE down POST /journals/entries, because
   * CreateJournalEntryRequest carries no ClientId and the controller never sets one: that
   * endpoint has no idempotency guard and the row it writes has no correlation id on it,
   * so a create sent there twice is two memories and nothing can ever tell.
   *
   * Classified against what src/api/ApiClient.js actually throws:
   *
   *   SAFE   code 'OFFLINE'          ApiError.offlineError(), thrown by request() before
   *                                  fetch is called at all -- the server saw nothing.
   *   SAFE   status 400..499         Came back from _handleResponse, so the server
   *                                  answered and refused the payload. Nothing committed,
   *                                  and the batch will refuse it identically next time,
   *                                  so holding it back would strand it. (The synthetic
   *                                  401 AUTH_REQUIRED is also pre-flight, so also safe.)
   *   UNSAFE code 'TIMEOUT'          ApiError.timeoutError(), from _fetchWithTimeout's
   *                                  AbortController. The abort is client-side; the
   *                                  server may have committed and only the reply was
   *                                  lost. This is the commonest mobile failure there is.
   *   UNSAFE code 'NETWORK_ERROR'    ApiError.networkError(error.message), the catch-all
   *                                  for a fetch rejection. React Native reports both a
   *                                  DNS failure (never sent) and a connection dropped
   *                                  after delivery as the same "Network request failed",
   *                                  with nothing on the error to tell them apart -- so
   *                                  the pre-flight case is NOT separable here and the
   *                                  whole code has to be treated as unsafe.
   *   UNSAFE status >= 500           A gateway or load balancer can answer 502/504 after
   *                                  the origin has already written.
   *   UNSAFE anything else           Includes a plain Error thrown locally, e.g. by
   *                                  JournalApi's own response mapping after a successful
   *                                  POST. Unknown means unsafe.
   *
   * The cost of the unsafe cases is one sync interval: the create stays pending and the
   * next batch attempt carries it, correlated. The cost of getting it wrong the other way
   * is a duplicate memory that neither side can detect.
   */
  _batchFailureProvesNothingWasSent(error) {
    if (error?.code === 'OFFLINE') return true;

    const status = error?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return true;

    return false;
  }

  /**
   * The batch endpoint could not be reached, so try each operation on its own.
   */
  async _fallbackToSingleOperations(operations, result, error) {
    console.log('[SyncEngine] Batch sync failed, falling back to individual ops:', error?.message);

    const safeToResendCreates = this._batchFailureProvesNothingWasSent(error);

    for (const op of operations) {
      // Updates and deletes are idempotent -- a repeated PATCH or DELETE cannot make a
      // second memory -- so they always fall back. A create cannot, unless we know the
      // batch never landed.
      if (op.type === SyncOperationType.CREATE_ENTRY && !safeToResendCreates) {
        console.log(
          '[SyncEngine] Holding a create back rather than re-sending it unguarded:',
          op.id, '| batch failed with', error?.code || error?.status || 'an unknown error',
          '| it stays pending for the next batch, which deduplicates on clientId'
        );
        continue;
      }

      try {
        await this._processSingleOperation(op);
        result.succeeded++;
      } catch (opError) {
        // The response body, not just the status. A 400 here says the server rejected
        // the payload and nothing else; without the body there is no way to tell which
        // field it objected to, and the operation retries against the same objection
        // until it exhausts its attempts. Logged rather than surfaced -- this is for
        // diagnosis, and the queue's own handling is unchanged.
        const detail = opError?.data ? JSON.stringify(opError.data).slice(0, 500) : null;
        console.error(
          '[SyncEngine] Operation failed:', op.id, op.type, opError.message,
          detail ? `| server said: ${detail}` : '| server sent no body'
        );
        await SyncQueue.markFailed(op.id, opError.message);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * True when a media item is a device file the server has no media id for (007 FR-040, R12).
   * An item uploaded before mediaId was recorded carries its server url and keeps the id it
   * was given then; only an item with neither has not been uploaded.
   */
  _isUnuploadedItem(item) {
    return !!((item?.localPath || item?.uri) && !item?.mediaId && !(item?.serverUrl || item?.url));
  }

  /** Held by this feature: has a file that can still upload (not flagged as lost). */
  _isHeldEntry(entry) {
    return (entry?.contentBlocks || []).some((block) =>
      (Array.isArray(block?.media) ? block.media : []).some(
        (item) => this._isUnuploadedItem(item) && !item.uploadFailed
      )
    );
  }

  /** True when an entry still references such a file: its reference would be a local id. */
  _hasUnuploadedMedia(entry) {
    return (entry?.contentBlocks || []).some((block) =>
      (Array.isArray(block?.media) ? block.media : []).some((item) => this._isUnuploadedItem(item))
    );
  }

  /**
   * Decide what to do with an entry's unuploaded media (FR-040, R-b, R-c).
   * - a file still on disk can upload: the entry is held;
   * - a file that is gone can never upload: it is left off the wire and flagged on the
   *   device (uploadFailed/missingFile), so its tile says so, and the entry is not blocked.
   * `wire` is what to send (device-only fields removed); `saved` is what to keep locally.
   */
  async _planEntryMedia(entry) {
    let hold = false;
    let flagged = false;
    const saved = [];
    const wire = [];
    for (const block of entry.contentBlocks || []) {
      if (!Array.isArray(block?.media)) {
        saved.push(block);
        wire.push(block);
        continue;
      }
      const savedMedia = [];
      const wireMedia = [];
      for (const item of block.media) {
        if (!this._isUnuploadedItem(item)) {
          const { localPath, uri, uploadFailed, missingFile, ...onWire } = item || {};
          savedMedia.push(item);
          wireMedia.push(onWire);
        } else if (await JournalService.fileService.getFileInfo(item.localPath || item.uri)) {
          hold = true;
          // Readable again: the label no longer applies.
          const { uploadFailed, missingFile, ...rest } = item;
          flagged = flagged || !!(uploadFailed || missingFile);
          savedMedia.push(rest);
        } else {
          flagged = flagged || !item.uploadFailed;
          savedMedia.push({ ...item, uploadFailed: true, missingFile: true });
        }
      }
      saved.push({ ...block, media: savedMedia });
      wire.push({ ...block, media: wireMedia });
    }
    return { hold, flagged, saved, wire };
  }

  /**
   * Prepare create/update operations for sending. An entry whose media can still upload is
   * held -- left Pending, counted, never dropped -- and the device keeps rendering
   * localPath. The rest are sent with the entry's CURRENT blocks, not the snapshot taken
   * when the operation was queued.
   */
  async _withoutHeldEntries(operations, result) {
    result.held = 0;
    const sendable = [];
    for (const op of operations) {
      const isWrite =
        op.type === SyncOperationType.CREATE_ENTRY || op.type === SyncOperationType.UPDATE_ENTRY;
      const entry = isWrite && op.entityId
        ? await DatabaseService.getEntryByLocalId(op.entityId).catch(() => null)
        : null;
      if (!entry) {
        sendable.push(op);
        continue;
      }
      const plan = await this._planEntryMedia(entry);
      if (plan.hold) {
        console.warn('[SyncEngine] Holding entry until its media has a server id:', op.entityId);
        if (plan.flagged) {
          await DatabaseService.updateEntry(op.entityId, { contentBlocks: plan.saved });
        }
        if (entry.syncStatus === SyncStatus.FAILED) {
          await DatabaseService.updateEntry(op.entityId, { syncStatus: SyncStatus.PENDING });
        }
        result.held++;
        continue;
      }
      if (plan.flagged) {
        await DatabaseService.updateEntry(op.entityId, { contentBlocks: plan.saved });
      }
      // content_blocks (the snapshot) wins over contentBlocks in the API formatter, so drop it.
      const { content_blocks, ...data } = op.data || {};
      sendable.push({ ...op, data: { ...data, contentBlocks: plan.wire } });
    }
    return sendable;
  }

  /**
   * Find the queued operation a server refusal belongs to.
   *
   * Server id first, because it is unambiguous and it is what a refused update or delete
   * carries. Client id second, because a refused *create* has `ServerId = string.Empty`
   * (see `BatchSync` in the Hub's JournalsController) and `ClientId` is then the only
   * correlating field there is.
   *
   * Returns null when neither matches, which the caller reports rather than ignores.
   *
   * @param {object} refusal - normalised `{ clientId, serverId, reason }`
   * @param {object} queued - the `creates` / `updates` / `deletes` operations just pushed
   */
  _findRefusedOperation(refusal, { creates, updates, deletes }) {
    if (refusal.serverId) {
      const byServerId =
        updates.find(op => op.serverId === refusal.serverId) ||
        deletes.find(op => op.serverId === refusal.serverId);
      if (byServerId) return byServerId;
    }

    if (refusal.clientId) {
      // Both spellings: the queued payload is a SQLite row (`local_id`) on some paths and
      // an in-memory entry (`localId`) on others.
      const byClientId = creates.find(
        op => (op.data?.local_id || op.data?.localId) === refusal.clientId
      );
      if (byClientId) return byClientId;
    }

    return null;
  }

  /**
   * Process a single sync operation
   */
  async _processSingleOperation(operation) {
    await SyncQueue.markInProgress(operation.id);

    // Defensively drop malformed operations (e.g. missing entityId) so they
    // cannot loop or wedge the queue.
    if (!operation.entityId) {
      console.warn('[SyncEngine] Dropping malformed operation (no entityId):', operation.id, operation.type);
      await SyncQueue.markCompleted(operation.id);
      return;
    }

    // The queued payload is a snapshot taken when the operation was enqueued, and the
    // entry can change afterwards -- a media upload rewrites its blocks with real urls
    // precisely while the create sits waiting. Pushing the snapshot would send the local
    // file paths again and be rejected for the same reason as before. Read the row as it
    // stands, falling back to the snapshot if it has since been deleted.
    const currentEntry = operation.entityId
      ? await DatabaseService.getEntryByLocalId(operation.entityId).catch(() => null)
      : null;
    // The fresh row, with the blocks _withoutHeldEntries prepared for sending (when it ran).
    const payload = currentEntry
      ? { ...currentEntry, contentBlocks: operation.data?.contentBlocks ?? currentEntry.contentBlocks }
      : operation.data;

    switch (operation.type) {
      case SyncOperationType.CREATE_ENTRY: {
        const response = await JournalApi.createEntry(payload);
        await this._handleCreateSuccess(operation, response.serverId);
        await SyncQueue.markCompleted(operation.id, { serverId: response.serverId });
        break;
      }

      case SyncOperationType.UPDATE_ENTRY: {
        // Without a server id there is nothing to update: the entry has never been
        // created remotely, so a PUT goes to a path that does not accept one and comes
        // back 405. Its pending create carries the change instead, now that the push
        // reads the row fresh.
        const serverId = operation.serverId || currentEntry?.serverId;
        if (!serverId) {
          console.log('[SyncEngine] Skipping update for an entry not yet on the server:', operation.entityId);
          await SyncQueue.markCompleted(operation.id);
          break;
        }

        const response = await JournalApi.updateEntry(
          serverId,
          payload,
          payload.updatedAt || operation.data?.updated_at
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
    // Update local entry with server ID (direct write, no re-enqueue)
    await JournalRepository.markSynced(operation.entityId, serverId);

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
    await JournalRepository.markSynced(operation.entityId);

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
      localModified: localEntry.updatedAt,
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
          await JournalRepository.hardDelete(localEntry.localId);
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

    // An entry this feature is holding (unsent, media still uploading) keeps its local blocks:
    // overwriting it would lose the photo reference. Every other entry takes the usual path.
    if (localEntry.syncStatus !== SyncStatus.SYNCED && this._isHeldEntry(localEntry)) return;

    // Check for conflict
    const conflict = ConflictResolver.detectConflict(localEntry, serverEntry);

    if (conflict) {
      const resolution = await ConflictResolver.resolveConflict(conflict);
      
      if (resolution.result === ResolutionResult.REQUIRES_MANUAL) {
        // Leave entry as is, user will resolve
        return;
      }
    }

    // Update local entry with server data (direct write, no re-enqueue)
    if (localEntry.syncStatus === SyncStatus.SYNCED || !conflict) {
      await JournalRepository.applyServerUpdate(localEntry.localId, {
        contentBlocks: mapped.contentBlocks,
        location: mapped.location,
        visibility: mapped.visibility,
      });
    }
  }

  /**
   * Upload pending media files
   */
  /**
   * Queue any media an entry holds that has not been uploaded and is not already queued.
   *
   * Queueing happens when an entry is created, so anything created while that path was
   * broken -- which it was, for every entry ever made with a photo -- has media on disk
   * that nothing will ever pick up. Fixing the creation path only helps entries made
   * afterwards; these would sit unsynced forever with no indication why.
   *
   * Re-walked on every sync rather than run once. It is cheap, the insert ignores
   * duplicates, and a one-shot migration would miss anything left behind by a future gap
   * of the same kind.
   */
  async _backfillMediaQueue() {
    try {
      // Pending and failed entries: exactly the ones that have not made it to the server,
      // which is where unqueued media will be.
      const candidates = await DatabaseService.getPendingSyncEntries();

      for (const entry of candidates) {
        await JournalService._queueMediaForUpload(entry);
      }

      if (candidates.length > 0) {
        console.log('[SyncEngine] Backfilled media queue from', candidates.length, 'entries');
      }
    } catch (error) {
      // Never fail a sync over this; the upload step below simply finds nothing.
      console.warn('[SyncEngine] Media backfill failed:', error?.message);
    }
  }

  /**
   * Write an uploaded url onto the media item inside its entry, and re-queue the entry.
   *
   * Matched on file path rather than id: media saved before ids were assigned carries a
   * synthesised one, and the path is the field that is always present and always unique
   * within an entry.
   */
  async _applyUploadedMediaToEntry(media, uploadResult) {
    const entryLocalId = media.entry_id;
    if (!entryLocalId) return;

    const entry = await DatabaseService.getEntryByLocalId(entryLocalId);
    if (!entry) return;

    let changed = false;

    const contentBlocks = (entry.contentBlocks || []).map((block) => {
      if (!Array.isArray(block?.media)) return block;

      const items = block.media.map((item) => {
        const localPath = item?.localPath || item?.uri;
        if (localPath !== media.local_uri) return item;

        changed = true;
        const { uploadFailed, missingFile, ...rest } = item; // it uploaded: no label
        return {
          ...rest,
          // The server's id, never the local one (007 R12). _uploadPendingMedia refuses
          // an upload that returned none, so this is always set by the time it runs.
          id: uploadResult.mediaId,
          mediaId: uploadResult.mediaId,
          serverUrl: uploadResult.url,
          url: uploadResult.url,
          thumbnailUrl: uploadResult.thumbnailUrl || item.thumbnailUrl,
          displayUrl: uploadResult.displayUrl || item.displayUrl,
        };
      });

      return { ...block, media: items };
    });

    if (!changed) return;

    // Marked pending again so the entry is pushed with the url it now carries. Without
    // this the entry keeps whatever it was pushed with the first time.
    await DatabaseService.updateEntry(entryLocalId, {
      contentBlocks,
      syncStatus: 'pending',
    });

    // Only when the entry exists remotely. If it does not, its create is still queued and
    // will now pick up these blocks when it reads the row at push time -- enqueueing an
    // update would PUT to a path with no id behind it and take a 405.
    if (entry.serverId) {
      await SyncQueue.enqueue({
        type: SyncOperationType.UPDATE_ENTRY,
        entityId: entryLocalId,
        serverId: entry.serverId,
        data: { ...entry, contentBlocks },
      });
    }
  }

  async _uploadPendingMedia() {
    const result = { uploaded: 0, failed: 0 };

    await this._backfillMediaQueue();

    // Get pending media from queue
    const mediaQueue = await DatabaseService.getMediaQueue();
    // 'failed' included deliberately. A failed upload used to be terminal: the filter took
    // only 'pending', so anything rejected once was never offered again -- and every upload
    // was rejected while the request contract was wrong, leaving a queue of files that
    // would never be retried no matter how many syncs ran.
    //
    // 'uploading' too: that status is written before the attempt, so an app closed
    // mid-upload leaves items stranded in it forever.
    const RETRYABLE = ['pending', 'failed', 'uploading'];
    const pending = mediaQueue.filter(m => RETRYABLE.includes(m.status));

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

        // No media id means nothing the entry can safely reference (007 R12). Failed, not
        // completed: it is retried, and the entry stays held until an upload returns one.
        if (!uploadResult?.mediaId) {
          throw new Error('Upload returned no media id');
        }

        // Mark as completed
        await DatabaseService.updateMediaQueueItem(media.id, {
          status: 'completed',
          server_url: uploadResult.url,
          server_id: uploadResult.mediaId,
        });

        // Put the url on the entry itself. Recording it only in the queue left the entry
        // still pointing at a local file path, so it was pushed referencing something no
        // other device can read -- the phone reported everything synced and the web app
        // showed entries with no pictures in them.
        await this._applyUploadedMediaToEntry(media, uploadResult);

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

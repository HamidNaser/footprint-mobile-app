/**
 * What a person is actually told when the server refuses a memory.
 *
 * The defect this pins down is the one left over after PR #44. A refused operation is now
 * *settled* -- marked `conflict`, no longer re-sent -- and `SyncContext` folds the count
 * into the sync badge, so the badge says "1 not sent". That is a warning light with nothing
 * behind it: among two hundred memories, the person cannot tell which one is stuck, and
 * cannot tell why. The only text that exists is the server's own, written for engineers
 * ("Entry not found"), which tells a person nothing at all.
 *
 * ## Why this drives the real queue through real SQL
 *
 * The badge count comes from `SyncQueue.getStats().conflict`, which is a `GROUP BY status`
 * over `sync_queue`. If the *detail* came from anywhere else -- the transient
 * `conflictDetails` array that `_pushLocalChanges` returns, say -- then count and detail
 * could disagree, and after an app restart the count would survive while the detail
 * vanished. That is today's bug rebuilt one layer up. So the notice is read back out of the
 * same rows, and this test proves it by going all the way: fake server refuses -> real
 * SyncEngine -> real ConflictResolver -> real SyncQueue -> real SQL -> the notice model.
 *
 * `expo-sqlite` is a native module and cannot load under jest, so the real statements run
 * against Node's own SQLite, exactly as SyncEngine.batchConflicts.test.js already does.
 *
 * ## What this test does NOT do
 *
 * It does not grep source text. `src/database/entryDatePrecisionSchema.test.js` asserts by
 * searching a file for a line, and it stayed green for months while the value it guarded
 * was being discarded on the wire. Every assertion here is on a returned value.
 *
 * It also asserts nothing about an *action* on a refused memory -- there is deliberately
 * none. Naming the memory and saying what happened was chosen over offering retry/discard,
 * and that is the owner's call to revisit.
 *
 * ## Where the server's reason strings came from
 *
 * Read out of the backend, not guessed:
 *   footprint-backend/Footprint.Hub/src/Footprint.Hub.Api/Controllers/V1/JournalsController.cs
 *     BatchSync()         -- "Entry not found", "Not authorized to update this entry",
 *                            "Not authorized to delete this entry"
 *     ValidateEntryDate() -- "An entry needs a date. The 'date' field was missing or empty."
 *     ValidateVisibility()-- "Invalid visibility '<x>'. Allowed: <list>." (interpolated),
 *                            "Custom visibility requires a non-empty sharedWith list."
 */

import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES } from '../../database/schema';

let db;

/**
 * expo-sqlite coerces an `undefined` bind parameter to NULL; node:sqlite throws on it.
 * Coerce here so the fake driver is faithful to the real one.
 */
const bind = (params = []) => params.map((p) => (p === undefined ? null : p));

const mockDriver = {
  runAsync: async (sql, params) => db.prepare(sql).run(...bind(params)),
  getAllAsync: async (sql, params) => db.prepare(sql).all(...bind(params)),
  getFirstAsync: async (sql, params) => db.prepare(sql).get(...bind(params)) ?? null,
  execAsync: async (sql) => db.exec(sql),
  withTransactionAsync: async (fn) => {
    db.exec('BEGIN');
    try {
      await fn();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  },
};

jest.mock('../../database', () => ({
  getDatabase: jest.fn(async () => mockDriver),
}));

// ============================================================
// Everything the engine talks to apart from the queue
// ============================================================

const mockServer = {
  batchSync: jest.fn(),
  getChanges: jest.fn(async () => ({ entries: [], deletedIds: [], serverTimestamp: null })),
};

jest.mock('../../api/JournalApi', () => ({ JournalApi: mockServer }));

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {},
  ApiError: class ApiError extends Error {},
}));

jest.mock('../../api/MediaApi', () => ({ MediaApi: { uploadMedia: jest.fn() } }));

const mockEntriesByServerId = new Map();

jest.mock('../../repositories', () => ({
  JournalRepository: {
    getByServerId: jest.fn(async (serverId) =>
      (typeof serverId === 'string' && mockEntriesByServerId.get(serverId)) || null
    ),
    getById: jest.fn(async () => null),
    markSynced: jest.fn(async () => {}),
    applyServerUpdate: jest.fn(async () => {}),
    createFromServer: jest.fn(async () => {}),
    hardDelete: jest.fn(async () => {}),
  },
}));

jest.mock('./../NetworkMonitor', () => ({
  NetworkMonitor: {
    shouldSync: jest.fn(async () => true),
    isOffline: jest.fn(() => false),
    initialize: jest.fn(async () => {}),
    addConnectionListener: jest.fn(),
    destroy: jest.fn(),
    getNetworkStatus: jest.fn(async () => ({ canSync: true })),
  },
  NetworkState: {},
}));

jest.mock('../../services/SettingsService', () => ({
  SettingsService: {
    getStorageMode: jest.fn(async () => 'cloud_sync'),
    getDefaultJournalId: jest.fn(async () => 'journal-1'),
  },
  StorageMode: { LOCAL_ONLY: 'local_only', CLOUD_SYNC: 'cloud_sync' },
}));

jest.mock('../../services/DatabaseService', () => ({
  DatabaseService: {
    getPendingSyncEntries: jest.fn(async () => []),
    getMediaQueue: jest.fn(async () => []),
    getSyncMetadata: jest.fn(async () => null),
    setSyncMetadata: jest.fn(async () => {}),
    getEntryByLocalId: jest.fn(async () => null),
    updateEntry: jest.fn(async () => {}),
    updateMediaQueueItem: jest.fn(async () => {}),
  },
}));

jest.mock('../../services/JournalService', () => ({
  JournalService: { _queueMediaForUpload: jest.fn(async () => {}) },
}));

// Imported after the mocks are declared. The engine, the queue and the conflict resolver
// are all the real ones.
const { SyncEngine } = require('../SyncEngine');
const { SyncQueue, SyncOperationType } = require('../SyncQueue');
const { refusedMemoriesFrom, GENERIC_REFUSAL } = require('../../utils/refusedMemories');
const { syncBadgeStatus, SyncBadgeStatus } = require('../../utils/syncStatus');

/** The server accepted everything. */
const cleanResponse = () => ({
  created: [],
  updated: [],
  deleted: [],
  conflicts: [],
  serverTimestamp: '2026-10-17T10:00:00Z',
});

/**
 * Read the notice the way the app does: out of the settled queue rows, not out of the
 * sync result. Deliberately the full path, because it is the path that survives a restart.
 */
const whatThePersonIsShown = async () =>
  refusedMemoriesFrom(await SyncQueue.getConflictedOperations());

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(CREATE_TABLES.sync_queue);
  mockEntriesByServerId.clear();
  jest.clearAllMocks();
  mockServer.batchSync.mockImplementation(async () => cleanResponse());
  mockServer.getChanges.mockImplementation(async () => ({
    entries: [],
    deletedIds: [],
    serverTimestamp: null,
  }));
});

afterEach(() => {
  db.close();
});

describe('a memory the server refused', () => {
  it('names the memory and says what happened, in words a person can read', async () => {
    // One memory among many: an edit to a note about the old house. The server has no such
    // entry any more -- it was deleted on another device -- so it refuses the update with
    // "Entry not found", which is true and completely useless to the person holding
    // the phone.
    mockEntriesByServerId.set('srv-77', {
      localId: 'local-77',
      serverId: 'srv-77',
      syncStatus: 'pending',
    });

    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-77',
      serverId: 'srv-77',
      data: {
        local_id: 'local-77',
        date: '1978-06-04',
        updated_at: '2026-10-17T09:00:00Z',
        contentBlocks: [
          { type: 'text', content: 'the kitchen in the old house', order: 0 },
        ],
        location: { lat: 51.5, lng: -0.1, name: 'Birmingham' },
      },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [{ clientId: 'local-77', serverId: 'srv-77', reason: 'Entry not found' }],
    }));

    await SyncEngine.sync();

    const shown = await whatThePersonIsShown();

    // 1. Exactly one memory is named -- not a count, a memory.
    expect(shown).toHaveLength(1);

    // 2. The person can tell WHICH memory. Its own words, so it is recognisable among
    //    two hundred others.
    expect(shown[0].title).toBe('the kitchen in the old house');

    // 3. And WHAT HAPPENED, in plain English. Not "Entry not found".
    expect(shown[0].why).toBe(
      'This memory was deleted on another device, so your change could not be saved.'
    );

    // 4. The server's engineer-facing text is not what gets shown.
    expect(shown[0].why).not.toContain('Entry not found');

    // 5. It is tied back to the memory it belongs to, so a later change could act on it.
    expect(shown[0].localId).toBe('local-77');
  });

  it('names each one when the server refuses several at once', async () => {
    // Two memories, refused for two different reasons. One warning light cannot distinguish
    // them; the notice has to.
    mockEntriesByServerId.set('srv-1', { localId: 'local-1', serverId: 'srv-1', syncStatus: 'pending' });
    mockEntriesByServerId.set('srv-2', { localId: 'local-2', serverId: 'srv-2', syncStatus: 'pending' });

    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-1',
      serverId: 'srv-1',
      data: {
        local_id: 'local-1',
        contentBlocks: [{ type: 'text', content: 'Gran on the beach at Rhyl' }],
      },
    });
    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-2',
      serverId: 'srv-2',
      data: {
        local_id: 'local-2',
        contentBlocks: [{ type: 'text', content: 'the allotment in August' }],
      },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [
        { clientId: 'local-1', serverId: 'srv-1', reason: 'Entry not found' },
        {
          clientId: 'local-2',
          serverId: 'srv-2',
          reason: 'Custom visibility requires a non-empty sharedWith list.',
        },
      ],
    }));

    await SyncEngine.sync();

    const shown = await whatThePersonIsShown();
    const byTitle = Object.fromEntries(shown.map((m) => [m.title, m.why]));

    expect(shown).toHaveLength(2);
    expect(byTitle['Gran on the beach at Rhyl']).toBe(
      'This memory was deleted on another device, so your change could not be saved.'
    );
    expect(byTitle['the allotment in August']).toBe(
      'This memory is set to be shared with chosen people, but nobody was chosen, so it could not be saved.'
    );
  });

  it('shows something honest for a reason this app has never seen', async () => {
    // The server may add a reason without this app shipping. An unmapped one must still
    // produce a sentence -- not a blank line, not `undefined`, and not the raw text.
    mockEntriesByServerId.set('srv-3', { localId: 'local-3', serverId: 'srv-3', syncStatus: 'pending' });

    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-3',
      serverId: 'srv-3',
      data: { local_id: 'local-3', contentBlocks: [{ type: 'text', content: 'the shed roof' }] },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [
        {
          clientId: 'local-3',
          serverId: 'srv-3',
          reason: 'Entry rejected by retention policy RP-14',
        },
      ],
    }));

    await SyncEngine.sync();

    const [shown] = await whatThePersonIsShown();

    // Still identifiable, and still explained as far as the app honestly can.
    expect(shown.title).toBe('the shed roof');
    expect(shown.why.trim()).not.toBe('');
    expect(shown.why).not.toContain('undefined');
    expect(shown.why).not.toContain('RP-14');
    expect(shown.why).toBe(GENERIC_REFUSAL);
  });
});

describe('nothing refused', () => {
  it('shows no notice at all after a sync the server accepted', async () => {
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-5',
      data: {
        local_id: 'local-5',
        contentBlocks: [{ type: 'text', content: 'bluebells in the lane' }],
      },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      created: [{ clientId: 'local-5', serverId: 'srv-5', serverTimestamp: '2026-10-17T10:00:00Z' }],
    }));

    await SyncEngine.sync();

    // No phantom warning: an empty list, so the banner renders nothing rather than an
    // empty notice.
    expect(await SyncQueue.getConflictedOperations()).toEqual([]);
    expect(await whatThePersonIsShown()).toEqual([]);
  });

  it('shows no notice on an empty queue', async () => {
    expect(await whatThePersonIsShown()).toEqual([]);
  });

  it('shows no notice for work that is merely pending or failed', async () => {
    // Pending and failed are not refusals. They clear on their own or on a retry, and the
    // badge already covers them -- naming them here would turn ordinary backlog into an
    // alarm about a memory that is perfectly fine.
    const pendingId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-6',
      serverId: 'srv-6',
      data: { local_id: 'local-6', contentBlocks: [{ type: 'text', content: 'still queued' }] },
    });
    const failedId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-7',
      serverId: 'srv-7',
      data: { local_id: 'local-7', contentBlocks: [{ type: 'text', content: 'flaky network' }] },
    });
    await SyncQueue.markFailed(failedId, 'Network request timed out');

    expect(await whatThePersonIsShown()).toEqual([]);
    expect(pendingId).toBeTruthy();
  });
});

describe('the sync badge itself', () => {
  /**
   * The badge is the surface this change sits on, so its decision is re-checked against the
   * real queue rather than assumed. `syncBadgeStatus` is the one place that decision lives
   * -- SyncStatusBadge, JournalScreen and SettingsScreen all read it -- and this change does
   * not touch it.
   */
  const badgeFromQueue = async (syncState) => {
    const stats = await SyncQueue.getStats();
    return {
      status: syncBadgeStatus({
        syncState,
        pendingCount: stats.pending + stats.inProgress,
        failedCount: stats.failed + stats.conflict,
      }),
      failedCount: stats.failed + stats.conflict,
      pendingCount: stats.pending + stats.inProgress,
    };
  };

  it('still counts a refusal as a failure and still says "not sent"', async () => {
    mockEntriesByServerId.set('srv-8', { localId: 'local-8', serverId: 'srv-8', syncStatus: 'pending' });

    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-8',
      serverId: 'srv-8',
      data: { local_id: 'local-8', contentBlocks: [{ type: 'text', content: 'the old gate' }] },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [{ clientId: 'local-8', serverId: 'srv-8', reason: 'Entry not found' }],
    }));

    await SyncEngine.sync();

    const badge = await badgeFromQueue('idle');

    // Unchanged from before this change: one conflict, folded into the failed count, shown
    // as a failure even though the engine is idle.
    expect(badge.failedCount).toBe(1);
    expect(badge.pendingCount).toBe(0);
    expect(badge.status).toBe(SyncBadgeStatus.FAILED);

    // And the detail now sits beside that same number, read from the same rows.
    expect(await whatThePersonIsShown()).toHaveLength(1);
  });

  it('still says synced when the server accepted everything', async () => {
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-9',
      data: { local_id: 'local-9', contentBlocks: [{ type: 'text', content: 'first frost' }] },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      created: [{ clientId: 'local-9', serverId: 'srv-9', serverTimestamp: '2026-10-17T10:00:00Z' }],
    }));

    await SyncEngine.sync();

    const badge = await badgeFromQueue('idle');

    expect(badge.status).toBe(SyncBadgeStatus.SYNCED);
    expect(badge.failedCount).toBe(0);
  });

  it('still reports offline, syncing and disabled ahead of the queue depth', async () => {
    mockEntriesByServerId.set('srv-10', { localId: 'local-10', serverId: 'srv-10', syncStatus: 'pending' });

    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-10',
      serverId: 'srv-10',
      data: { local_id: 'local-10', contentBlocks: [{ type: 'text', content: 'the canal path' }] },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [{ clientId: 'local-10', serverId: 'srv-10', reason: 'Entry not found' }],
    }));

    await SyncEngine.sync();

    // A refusal present does not change the precedence the badge already had.
    expect((await badgeFromQueue('disabled')).status).toBe(SyncBadgeStatus.DISABLED);
    expect((await badgeFromQueue('offline')).status).toBe(SyncBadgeStatus.OFFLINE);
    expect((await badgeFromQueue('syncing')).status).toBe(SyncBadgeStatus.SYNCING);
  });
});

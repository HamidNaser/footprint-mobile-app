/**
 * A memory the server refuses must stop being pretended about.
 *
 * The defect this pins down: when `POST /journals/sync` comes back with a conflict, the
 * phone threw the refusal away, left the operation sitting in the queue, re-sent it on
 * every subsequent sync forever, and reported `success: true` with zero conflicts and zero
 * errors. The server even says *why* it refused -- "Entry not found", "Not authorized to
 * update this entry", an invalid visibility -- and every word of it was discarded.
 *
 * ## Where the server's shape was read from
 *
 * The fake server below returns the real wire shape, taken from the backend contract rather
 * than from what the client happened to expect -- the whole defect is that those two
 * disagreed, so a fake modelled on the client would prove nothing:
 *
 *   footprint-backend/Footprint.Hub/src/Footprint.Hub.Contracts/Api/Journals/JournalDtos.cs
 *     record SyncConflict  { string? ClientId; string? ServerId; required string Reason; }
 *     record SyncResultItem{ string? ClientId; required string ServerId; DateTime ServerTimestamp; }
 *
 *   footprint-backend/Footprint.Hub/src/Footprint.Hub.Api/Controllers/V1/JournalsController.cs
 *     BatchSync() -- the five places that add a SyncConflict, and the `Reason` strings they
 *     carry. Note `ServerId = string.Empty` for a refused *create*, where the only
 *     correlating field is `ClientId`.
 *
 * There is no `id` and no `serverVersion` anywhere in that contract. The client read both.
 *
 * ## What this test does NOT assert
 *
 * Nothing about what the person is shown, and nothing about the refusal being *resolved*.
 * A batch conflict carries a reason string and no server version, so there is nothing to
 * compare a local entry against -- resolving one needs a re-fetch or a contract change,
 * and that is the owner's call. This asserts only that the refusal is settled, counted and
 * carries its reason.
 */

import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES } from '../../database/schema';

// ============================================================
// A real SQLite engine behind the real SyncQueue
// ============================================================
//
// The queue's retry semantics are the thing under test here, and they live in SQL --
// `WHERE status = 'pending' OR (status = 'failed' AND retry_count < 3)`. A hand-written
// fake queue would be asserting on itself. `expo-sqlite` is a native module and cannot
// load under jest, so the real statements run against Node's own SQLite, exactly as
// src/database/photoMetadataDurability.test.js already does.

let db;

/**
 * expo-sqlite coerces an `undefined` bind parameter to NULL; node:sqlite throws on it.
 * Coerce here so the fake driver is faithful to the real one -- this matters, because
 * `WHERE server_id = NULL` matching no row is part of how the defect stayed silent.
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

jest.mock('../../api/JournalApi', () => ({
  JournalApi: mockServer,
}));

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {},
  ApiError: class ApiError extends Error {},
}));

jest.mock('../../api/MediaApi', () => ({
  MediaApi: { uploadMedia: jest.fn() },
}));

/**
 * `getByServerId` is kept faithful rather than stubbed flat: it answers only for an exact
 * server id it was seeded with, and returns null for anything else -- including
 * `undefined`, which is what the broken code passed it. Seeded *with* the entry the
 * conflict refers to, so a failure here is specifically "the client read the wrong field",
 * not "the repository was empty".
 */
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
const { SyncQueue, SyncOperationType, OperationStatus } = require('../SyncQueue');

/** The server accepted everything. */
const cleanResponse = () => ({
  created: [],
  updated: [],
  deleted: [],
  conflicts: [],
  serverTimestamp: '2026-10-17T10:00:00Z',
});

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

describe('a batch sync the server refuses', () => {
  it('settles the operation and stops claiming a clean sync', async () => {
    // An edit to a memory the server will not accept -- here because it belongs to
    // somebody else, which is a refusal no amount of retrying will ever turn into a
    // success.
    mockEntriesByServerId.set('srv-1', { localId: 'local-1', serverId: 'srv-1', syncStatus: 'pending' });

    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-1',
      serverId: 'srv-1',
      data: { local_id: 'local-1', updated_at: '2026-10-17T09:00:00Z' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [
        // JournalsController.BatchSync, the ownership guard on updates.
        { clientId: 'local-1', serverId: 'srv-1', reason: 'Not authorized to update this entry' },
      ],
    }));

    const result = await SyncEngine.sync();

    // 1. The refusal reaches the caller. Today this reports zero, beside success: true.
    expect(result.conflicts).toBe(1);
    expect(result.success).toBe(false);

    // 2. The operation is settled -- the queue no longer offers it for pushing.
    const pendingIds = (await SyncQueue.getPendingOperations()).map((op) => op.id);
    expect(pendingIds).not.toContain(operationId);

    // 3. And it is settled as a conflict, not quietly completed as though it had worked.
    const settled = await SyncQueue.getOperation(operationId);
    expect(settled.status).toBe(OperationStatus.CONFLICT);

    // 4. The thing a person would actually notice: it is not re-sent on the next sync.
    //    With nothing else queued there is now nothing to push at all, so the server is
    //    not called a second time -- which is the point. Before this change the same
    //    refused update went up again here, and on every sync after that, forever.
    mockServer.batchSync.mockClear();
    await SyncEngine.sync();
    expect(mockServer.batchSync).not.toHaveBeenCalled();
  });

  it("keeps the server's own words instead of a generic message", async () => {
    mockEntriesByServerId.set('srv-2', { localId: 'local-2', serverId: 'srv-2', syncStatus: 'pending' });

    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-2',
      serverId: 'srv-2',
      data: { local_id: 'local-2' },
    });

    // JournalsController.BatchSync returns this when the entry is gone from the server.
    const reason = 'Entry not found';

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [{ clientId: 'local-2', serverId: 'srv-2', reason }],
    }));

    const result = await SyncEngine.sync();

    // Reaches the caller...
    expect(result.conflictDetails).toEqual([
      expect.objectContaining({ reason, serverId: 'srv-2', localId: 'local-2', settled: true }),
    ]);

    // ...and is kept on the operation, so it is still there after the app restarts.
    const settled = await SyncQueue.getOperation(operationId);
    expect(settled.conflictData.reason).toBe(reason);
  });

  it('settles a refused create by its clientId, which is all the server sends for one', async () => {
    // A refused *create* has `ServerId = string.Empty` -- see JournalsController.BatchSync,
    // the ValidateVisibility/ValidateEntryDate branch. `ClientId` is the only correlating
    // field there, so matching has to fall back to it.
    //
    // Note: today's client sends the local id as `localId`, not `clientId`, so the server
    // echoes `ClientId = null` and a real refused create cannot be correlated at all. That
    // mismatch is the correlation-id work on PR #42, not this change. This asserts the
    // matching is right for when the field does arrive.
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-3',
      data: { local_id: 'local-3' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [{ clientId: 'local-3', serverId: '', reason: 'Invalid visibility' }],
    }));

    const result = await SyncEngine.sync();

    expect(result.conflicts).toBe(1);
    expect((await SyncQueue.getOperation(operationId)).status).toBe(OperationStatus.CONFLICT);
  });

  it('does not burn the retry budget meant for transient failures', async () => {
    // A server refusal is not a flaky network. Spending a retry on it would mean the
    // operation is re-sent twice more before the queue gives up, and `retryFailed()`
    // would re-arm it afterwards -- re-asking a question already answered "no".
    mockEntriesByServerId.set('srv-4', { localId: 'local-4', serverId: 'srv-4', syncStatus: 'pending' });

    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-4',
      serverId: 'srv-4',
      data: { local_id: 'local-4' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      conflicts: [{ clientId: 'local-4', serverId: 'srv-4', reason: 'Entry not found' }],
    }));

    await SyncEngine.sync();

    expect((await SyncQueue.getOperation(operationId)).retryCount).toBe(0);

    // And a user-driven "retry failed" does not resurrect it either.
    await SyncQueue.resetFailedOperations();
    expect((await SyncQueue.getOperation(operationId)).status).toBe(OperationStatus.CONFLICT);
  });
});

describe('a batch sync with a refusal alongside a success', () => {
  it('still settles the successful create normally', async () => {
    const createdOpId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-ok',
      data: { local_id: 'local-ok' },
    });

    mockEntriesByServerId.set('srv-bad', {
      localId: 'local-bad',
      serverId: 'srv-bad',
      syncStatus: 'pending',
    });
    const refusedOpId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-bad',
      serverId: 'srv-bad',
      data: { local_id: 'local-bad' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      // `clientId` is what the backend's SyncResultItem actually carries. `localId` is
      // included alongside it only because today's SyncEngine matches creates on
      // `created.localId` -- that mismatch is PR #42's correlation-id work, and depending
      // on it here would make this test assert somebody else's fix rather than this one.
      created: [{ clientId: 'local-ok', localId: 'local-ok', serverId: 'srv-ok', serverTimestamp: '2026-10-17T10:00:00Z' }],
      conflicts: [{ clientId: 'local-bad', serverId: 'srv-bad', reason: 'Not authorized to update this entry' }],
    }));

    const result = await SyncEngine.sync();

    expect(result.pushed).toBe(1);
    expect(result.conflicts).toBe(1);

    expect((await SyncQueue.getOperation(createdOpId)).status).toBe(OperationStatus.COMPLETED);
    expect((await SyncQueue.getOperation(refusedOpId)).status).toBe(OperationStatus.CONFLICT);
  });
});

describe('a batch sync with no conflicts', () => {
  /**
   * The backward-compatibility case. Deliberately asserts only on behaviour that already
   * existed, so this test passes on `main` and must go on passing afterwards -- a test
   * that only passes after the change would prove nothing about not having broken
   * anything. The new field is asserted separately, below.
   */
  it('behaves exactly as it did before conflicts were handled at all', async () => {
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-5',
      data: { local_id: 'local-5' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      created: [{ clientId: 'local-5', localId: 'local-5', serverId: 'srv-5', serverTimestamp: '2026-10-17T10:00:00Z' }],
    }));

    const result = await SyncEngine.sync();

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        pushed: 1,
        pulled: 0,
        conflicts: 0,
        errors: 0,
        mediaUploaded: 0,
      })
    );

    expect((await SyncQueue.getOperation(operationId)).status).toBe(OperationStatus.COMPLETED);
    expect(await SyncQueue.getPendingOperations()).toEqual([]);
  });

  it('reports an empty list of refusals rather than leaving the caller guessing', async () => {
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-6',
      data: { local_id: 'local-6' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...cleanResponse(),
      created: [{ clientId: 'local-6', localId: 'local-6', serverId: 'srv-6', serverTimestamp: '2026-10-17T10:00:00Z' }],
    }));

    const result = await SyncEngine.sync();

    expect(result.conflictDetails).toEqual([]);
  });

  it('leaves an empty queue alone and never calls the server', async () => {
    const result = await SyncEngine.sync();

    expect(mockServer.batchSync).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ success: true, pushed: 0, conflicts: 0, errors: 0 })
    );
  });
});

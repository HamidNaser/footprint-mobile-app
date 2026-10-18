/**
 * Where 007's held entries meet main's batch-sync rules (PRs #42, #44, #45).
 *
 * Each side was tested alone. 007 holds an entry whose photo has not uploaded yet, and
 * rewrites what is sent to the entry's CURRENT blocks (dropping the queued `content_blocks`
 * snapshot). main correlates the batch reply by `clientId`, settles refusals as CONFLICT,
 * refuses to re-send a create down the unguarded single endpoint unless the batch provably
 * never landed, and reports a result whose shape is asserted exactly.
 *
 * Neither side's tests cover the two together. These do, on the real SyncQueue over a real
 * SQLite engine (the harness main's batchConflicts suite uses) and the real ConflictResolver:
 *
 * - a held entry stays out of a batch whose other create is correlated and completed, and is
 *   sent once -- not twice -- when its photo finishes;
 * - a create 007 rewrote for the wire is still correlated by `clientId` when the server
 *   refuses it, so the refusal is settled rather than re-sent forever;
 * - when the batch reply is lost, neither a held create nor a ready create is re-sent
 *   unguarded, and an update that does fall back carries the fresh blocks, not the snapshot.
 */

import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES } from '../../database/schema';

let db;
const bind = (params = []) => params.map((p) => (p === undefined ? null : p));
const mockDriver = {
  runAsync: async (sql, params) => db.prepare(sql).run(...bind(params)),
  getAllAsync: async (sql, params) => db.prepare(sql).all(...bind(params)),
  getFirstAsync: async (sql, params) => db.prepare(sql).get(...bind(params)) ?? null,
  execAsync: async (sql) => db.exec(sql),
};

jest.mock('../../database', () => ({ getDatabase: jest.fn(async () => mockDriver) }));

const mockServer = {
  batchSync: jest.fn(),
  createEntry: jest.fn(),
  updateEntry: jest.fn(),
  deleteEntry: jest.fn(),
  getChanges: jest.fn(),
};
jest.mock('../../api/JournalApi', () => ({ JournalApi: mockServer }));
jest.mock('../../api/ApiClient', () => ({ ApiClient: {}, ApiError: class ApiError extends Error {} }));
jest.mock('../../api/MediaApi', () => ({ MediaApi: { uploadMedia: jest.fn() } }));

jest.mock('../../repositories', () => ({
  JournalRepository: {
    getByServerId: jest.fn(async () => null),
    getById: jest.fn(async () => null),
    markSynced: jest.fn(async () => {}),
    markSyncFailed: jest.fn(async () => {}),
    applyServerUpdate: jest.fn(async () => {}),
    createFromServer: jest.fn(async () => {}),
    hardDelete: jest.fn(async () => {}),
  },
}));

jest.mock('../NetworkMonitor', () => ({
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

/** The local rows, by local id, as DatabaseService.getEntryByLocalId would read them. */
const mockRows = new Map();
jest.mock('../../services/DatabaseService', () => ({
  DatabaseService: {
    getPendingSyncEntries: jest.fn(async () => []),
    getMediaQueue: jest.fn(async () => []),
    getSyncMetadata: jest.fn(async () => null),
    setSyncMetadata: jest.fn(async () => {}),
    getEntryByLocalId: jest.fn(async (id) => mockRows.get(id) || null),
    updateEntry: jest.fn(async () => {}),
    updateMediaQueueItem: jest.fn(async () => {}),
  },
}));

jest.mock('../../services/JournalService', () => ({
  JournalService: {
    _queueMediaForUpload: jest.fn(async () => {}),
    // Every device file in these tests is still on disk, so an unuploaded one is a hold.
    fileService: { getFileInfo: jest.fn(async () => ({ exists: true })) },
  },
}));

const { SyncEngine } = require('../SyncEngine');
const { SyncQueue, SyncOperationType, OperationStatus } = require('../SyncQueue');

const clean = () => ({ created: [], updated: [], deleted: [], conflicts: [], serverTimestamp: null });

/** A photo still waiting to upload: a device file and no server id or url. */
const waiting = { id: 'local-uuid', localPath: 'file:///a.jpg' };
/** The same photo after upload. */
const uploaded = { id: 'srv-m1', mediaId: 'srv-m1', localPath: 'file:///a.jpg', url: 'https://cdn/o', serverUrl: 'https://cdn/o' };

const row = (localId, media, extra = {}) => ({
  localId,
  syncStatus: 'pending',
  contentBlocks: [{ type: 'image', media }],
  ...extra,
});

/** The queued snapshot, taken when the entry was saved offline -- before any upload. */
const snapshot = (localId) => ({
  local_id: localId,
  updated_at: '2026-10-17T09:00:00Z',
  content_blocks: JSON.stringify([{ type: 'image', media: [waiting] }]),
});

const enqueueCreate = (localId) =>
  SyncQueue.enqueue({ type: SyncOperationType.CREATE_ENTRY, entityId: localId, data: snapshot(localId) });

const sentCreates = () => mockServer.batchSync.mock.calls.flatMap(([body]) => body.creates);

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(CREATE_TABLES.sync_queue);
  mockRows.clear();
  jest.clearAllMocks();
  mockServer.batchSync.mockImplementation(async () => clean());
  mockServer.getChanges.mockImplementation(async () => ({ entries: [], deletedIds: [], serverTimestamp: null }));
});

afterEach(() => db.close());

describe('a held entry in a correlated batch', () => {
  it('stays out while its neighbour is correlated by clientId, then goes up exactly once', async () => {
    mockRows.set('L1', row('L1', [waiting]));
    mockRows.set('L2', row('L2', [uploaded]));
    const heldOp = await enqueueCreate('L1');
    const readyOp = await enqueueCreate('L2');

    mockServer.batchSync.mockImplementationOnce(async () => ({
      ...clean(),
      created: [{ clientId: 'L2', serverId: 'S2' }],
    }));

    const first = await SyncEngine.sync();

    expect(sentCreates().map((c) => c.local_id)).toEqual(['L2']);
    expect((await SyncQueue.getOperation(readyOp)).status).toBe(OperationStatus.COMPLETED);
    // Held is not refused and not failed: it is simply still waiting.
    const held = await SyncQueue.getOperation(heldOp);
    expect(held.status).toBe(OperationStatus.PENDING);
    expect(held.retry_count ?? held.retryCount ?? 0).toBe(0);
    expect(first).toMatchObject({ success: true, pushed: 1, conflicts: 0, conflictDetails: [] });

    // The photo finishes. The held create goes up on the next sync, correlated, and settles.
    mockRows.set('L1', row('L1', [uploaded]));
    mockServer.batchSync.mockImplementationOnce(async () => ({
      ...clean(),
      created: [{ clientId: 'L1', serverId: 'S1' }],
    }));

    await SyncEngine.sync();
    await SyncEngine.sync();

    expect(sentCreates().filter((c) => c.local_id === 'L1')).toHaveLength(1);
    expect((await SyncQueue.getOperation(heldOp)).status).toBe(OperationStatus.COMPLETED);
  });
});

describe('a refused create that 007 rewrote for the wire', () => {
  it('is still found by clientId and settled as a conflict, with fresh blocks on the wire', async () => {
    mockRows.set('L3', row('L3', [uploaded]));
    const opId = await enqueueCreate('L3');

    mockServer.batchSync.mockImplementationOnce(async () => ({
      ...clean(),
      // JournalsController.BatchSync: a refused create has an empty ServerId.
      conflicts: [{ clientId: 'L3', serverId: '', reason: 'Invalid visibility' }],
    }));

    const result = await SyncEngine.sync();

    const [sent] = sentCreates();
    expect(sent.content_blocks).toBeUndefined();
    expect(JSON.stringify(sent)).not.toContain('file:///a.jpg');
    expect(sent.contentBlocks[0].media[0].id).toBe('srv-m1');

    expect(result.success).toBe(false);
    expect(result.conflictDetails).toEqual([
      expect.objectContaining({ reason: 'Invalid visibility', localId: 'L3', settled: true }),
    ]);
    expect((await SyncQueue.getOperation(opId)).status).toBe(OperationStatus.CONFLICT);
  });
});

describe('a batch whose reply is lost', () => {
  it('re-sends no create unguarded, held or not, and an update falls back with fresh blocks', async () => {
    mockRows.set('L1', row('L1', [waiting]));
    mockRows.set('L2', row('L2', [uploaded]));
    mockRows.set('U1', row('U1', [uploaded], { serverId: 'S-U1' }));
    const heldOp = await enqueueCreate('L1');
    const readyOp = await enqueueCreate('L2');
    const updateOp = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'U1',
      serverId: 'S-U1',
      data: snapshot('U1'),
    });

    // ApiError.timeoutError(): client-side abort, the server may have committed.
    mockServer.batchSync.mockImplementationOnce(async () => {
      throw Object.assign(new Error('Request timed out'), { code: 'TIMEOUT' });
    });
    mockServer.updateEntry.mockResolvedValue({ type: 'success' });

    await SyncEngine.sync();

    // The held entry was never even in the batch, so it cannot reach the fallback; the ready
    // create is held back by main's rule; only the idempotent update goes one by one.
    expect(mockServer.batchSync.mock.calls[0][0].creates.map((c) => c.local_id)).toEqual(['L2']);
    expect(mockServer.createEntry).not.toHaveBeenCalled();
    expect(mockServer.updateEntry).toHaveBeenCalledTimes(1);
    const [serverId, payload] = mockServer.updateEntry.mock.calls[0];
    expect(serverId).toBe('S-U1');
    expect(JSON.stringify(payload.contentBlocks)).not.toContain('file:///a.jpg');
    expect(payload.contentBlocks[0].media[0].id).toBe('srv-m1');

    expect((await SyncQueue.getOperation(heldOp)).status).toBe(OperationStatus.PENDING);
    expect((await SyncQueue.getOperation(readyOp)).status).toBe(OperationStatus.PENDING);
    expect((await SyncQueue.getOperation(updateOp)).status).toBe(OperationStatus.COMPLETED);
  });
});

describe('the push result shape', () => {
  it('is main\'s exact shape plus 007\'s held count', async () => {
    mockRows.set('L1', row('L1', [waiting]));
    await enqueueCreate('L1');

    const result = await SyncEngine._pushLocalChanges();

    expect(result).toEqual({ succeeded: 0, failed: 0, conflicts: 0, conflictDetails: [], held: 1 });
  });
});

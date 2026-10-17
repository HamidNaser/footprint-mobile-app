/**
 * A retried batch sync must not duplicate the memory.
 *
 * The phone and the server disagreed about the name of the correlation id that ties an
 * uploaded memory to the server's reply. The phone sent `localId`; the Hub binds
 * `CreateSyncEntry.ClientId`, which its camelCase JSON policy spells `clientId`. So the
 * id arrived as null, the server's idempotency guard (`if (!string.IsNullOrEmpty(...))`)
 * was skipped, and the reply came back keyed by `clientId` while the phone looked for
 * `localId` on it. No match meant the queued operation was never marked completed, so the
 * next sync pushed it again -- and with no correlation id the server had no way to know it
 * had seen it before. Every retry made another copy of the same memory.
 *
 * These tests drive the real SyncEngine and the real JournalApi against a fake Hub that
 * implements the server's actual contract: it reads only `clientId`, keys its idempotency
 * on it, and answers with `clientId`/`serverId` objects. They assert the consequence a
 * person suffers -- how many memories the server ends up holding -- rather than the
 * spelling of a field, so renaming the field consistently to the wrong name on both sides
 * would not make them pass again.
 *
 * The `updated` arm is a separate break with a separate cause: BatchSyncResponse.Updated is
 * a list of SyncResultItem objects, and the phone iterated it as if it were a list of
 * strings. Covered below.
 */

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  ApiError: class ApiError extends Error {},
}));

jest.mock('../NetworkMonitor', () => ({
  NetworkMonitor: {
    initialize: jest.fn(),
    isOnline: jest.fn().mockReturnValue(true),
    isOffline: jest.fn().mockReturnValue(false),
    shouldSync: jest.fn().mockResolvedValue(true),
    addConnectionListener: jest.fn(),
    destroy: jest.fn(),
  },
  NetworkState: { ONLINE: 'online', OFFLINE: 'offline', UNKNOWN: 'unknown' },
}));

jest.mock('../SyncQueue', () => ({
  SyncOperationType: {
    CREATE_ENTRY: 'create_entry',
    UPDATE_ENTRY: 'update_entry',
    DELETE_ENTRY: 'delete_entry',
    UPLOAD_MEDIA: 'upload_media',
    DELETE_MEDIA: 'delete_media',
  },
  OperationStatus: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CONFLICT: 'conflict',
  },
  SyncQueue: {
    getPendingOperations: jest.fn(),
    markInProgress: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markConflict: jest.fn(),
  },
}));

jest.mock('../ConflictResolver', () => ({
  ConflictResolver: {
    processServerConflicts: jest.fn().mockResolvedValue([]),
    resolveConflict: jest.fn(),
  },
  ResolutionResult: { NO_CONFLICT: 'no_conflict', REQUIRES_MANUAL: 'requires_manual' },
}));

jest.mock('../../api/MediaApi', () => ({ MediaApi: {} }));

jest.mock('../../repositories', () => ({
  JournalRepository: {
    markSynced: jest.fn(),
    getById: jest.fn(),
    getByServerId: jest.fn(),
    hardDelete: jest.fn(),
  },
}));

jest.mock('../../services/JournalService', () => ({
  JournalService: { on: jest.fn(), emit: jest.fn() },
}));

jest.mock('../../services/SettingsService', () => ({
  SettingsService: {
    getStorageMode: jest.fn().mockResolvedValue('hybrid'),
    getDefaultJournalId: jest.fn().mockResolvedValue('j1'),
  },
  StorageMode: { LOCAL_ONLY: 'local_only', HYBRID: 'hybrid', CLOUD: 'cloud' },
}));

jest.mock('../../services/DatabaseService', () => ({
  DatabaseService: {
    getEntryByLocalId: jest.fn().mockResolvedValue(null),
    getSyncMetadata: jest.fn().mockResolvedValue(null),
    setSyncMetadata: jest.fn(),
    getPendingMediaUploads: jest.fn().mockResolvedValue([]),
  },
}));

const { SyncEngine } = require('../SyncEngine');
const { ApiClient } = require('../../api/ApiClient');
const { SyncQueue } = require('../SyncQueue');

const SERVER_TIME = '2026-10-17T09:00:00.000Z';

/**
 * A stand-in for the Hub's POST /journals/sync.
 *
 * It deliberately reads ONLY `clientId` out of a create, because that is the only name
 * CreateSyncEntry binds, and it answers with SyncResultItem objects
 * ({ clientId, serverId, serverTimestamp }) for both `created` and `updated`, because that
 * is what BatchSyncResponse declares. `deleted` really is a list of strings.
 */
function createFakeHub() {
  const stored = [];
  const byClientId = new Map(); // stands in for the unique {UserId, ClientId} index

  const handle = async (url, payload) => {
    const created = [];

    for (const create of payload.creates || []) {
      const clientId = create.clientId ?? null;

      // The server's idempotency guard. With no clientId it does not run at all.
      if (clientId) {
        const already = byClientId.get(clientId);
        if (already) {
          created.push({ clientId, serverId: already, serverTimestamp: SERVER_TIME });
          continue;
        }
      }

      const serverId = `srv-${stored.length + 1}`;
      stored.push({ serverId, clientId, title: create.title ?? null });
      if (clientId) {
        byClientId.set(clientId, serverId);
      }
      created.push({ clientId, serverId, serverTimestamp: SERVER_TIME });
    }

    const updated = (payload.updates || []).map((update) => ({
      clientId: update.clientId ?? null,
      serverId: update.serverId,
      serverTimestamp: SERVER_TIME,
    }));

    return {
      created,
      updated,
      deleted: payload.deletes || [],
      conflicts: [],
      serverChanges: [],
      serverTimestamp: SERVER_TIME,
    };
  };

  return { stored, handle };
}

/**
 * An in-memory stand-in for the persistent queue: an operation stays pending until
 * something marks it completed, which is exactly the mechanism that failed.
 */
function primeQueue(operations) {
  const completed = new Set();
  const failed = new Map();

  SyncQueue.getPendingOperations.mockImplementation(async () =>
    operations.filter((op) => !completed.has(op.id))
  );
  SyncQueue.markCompleted.mockImplementation(async (id) => {
    completed.add(id);
  });
  SyncQueue.markFailed.mockImplementation(async (id, error) => {
    failed.set(id, error);
  });
  SyncQueue.markInProgress.mockImplementation(async () => {});

  return { completed, failed };
}

function batchSyncCalls() {
  return ApiClient.post.mock.calls.filter(([url]) => String(url).endsWith('/journals/sync'));
}

const createOperation = () => ({
  id: 'op-create-1',
  type: 'create_entry',
  entityId: 'local-abc',
  serverId: null,
  data: {
    local_id: 'local-abc',
    journal_id: 'j1',
    date: '2026-08-05',
    title: 'Beach day',
    content_blocks: '[]',
    visibility: 'private',
    created_at: '2026-08-05T12:00:00.000Z',
    updated_at: '2026-08-05T12:00:00.000Z',
  },
});

describe('batch sync correlates creates with the server reply', () => {
  let hub;

  beforeEach(() => {
    jest.clearAllMocks();
    hub = createFakeHub();
    ApiClient.post.mockImplementation(hub.handle);
  });

  it('does not create the memory twice when the batch sync is retried', async () => {
    primeQueue([createOperation()]);

    await SyncEngine._pushLocalChanges();
    await SyncEngine._pushLocalChanges();

    // One memory was written on the phone, so the server must hold exactly one.
    expect(hub.stored.map((memory) => memory.serverId)).toEqual(['srv-1']);
  });

  it('marks the create completed on the first pass, so nothing is retried', async () => {
    const queue = primeQueue([createOperation()]);

    const result = await SyncEngine._pushLocalChanges();

    expect(result).toEqual({ succeeded: 1, failed: 0, conflicts: 0 });
    expect(queue.completed.has('op-create-1')).toBe(true);

    // Nothing pending means no second request at all.
    await SyncEngine._pushLocalChanges();
    expect(batchSyncCalls()).toHaveLength(1);
  });

  it('reaches the server by the batch endpoint, not the single-entry fallback', async () => {
    primeQueue([createOperation()]);

    await SyncEngine._pushLocalChanges();

    expect(batchSyncCalls()).toHaveLength(1);
  });

  it('records the server id against the local entry', async () => {
    const { JournalRepository } = require('../../repositories');
    primeQueue([createOperation()]);

    await SyncEngine._pushLocalChanges();

    expect(JournalRepository.markSynced).toHaveBeenCalledWith('local-abc', 'srv-1');
  });

  it('sends the correlation id under the name the server binds', async () => {
    primeQueue([createOperation()]);

    await SyncEngine._pushLocalChanges();

    const [, payload] = batchSyncCalls()[0];
    expect(payload.creates[0].clientId).toBe('local-abc');
  });

  it('lets the server deduplicate even when the reply is lost', async () => {
    // The reply never arrives, so the operation stays pending through no fault of the
    // matching code -- the server's own guard is what has to stop the duplicate.
    primeQueue([createOperation()]);
    ApiClient.post.mockImplementation(async (url, payload) => {
      await hub.handle(url, payload);
      throw Object.assign(new Error('Network request failed'), { status: 0 });
    });

    await SyncEngine._pushLocalChanges().catch(() => {});
    await SyncEngine._pushLocalChanges().catch(() => {});

    expect(hub.stored).toHaveLength(1);
  });
});

describe('batch sync correlates updates with the server reply', () => {
  let hub;

  const updateOperation = () => ({
    id: 'op-update-1',
    type: 'update_entry',
    entityId: 'local-xyz',
    serverId: 'srv-9',
    data: {
      local_id: 'local-xyz',
      journal_id: 'j1',
      date: '2026-08-06',
      title: 'Beach day, edited',
      content_blocks: '[]',
      visibility: 'friends',
      updated_at: '2026-08-06T12:00:00.000Z',
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    hub = createFakeHub();
    ApiClient.post.mockImplementation(hub.handle);
  });

  it('marks an accepted update completed instead of pushing it again every sync', async () => {
    const queue = primeQueue([updateOperation()]);

    const result = await SyncEngine._pushLocalChanges();

    expect(result).toEqual({ succeeded: 1, failed: 0, conflicts: 0 });
    expect(queue.completed.has('op-update-1')).toBe(true);

    await SyncEngine._pushLocalChanges();
    expect(batchSyncCalls()).toHaveLength(1);
  });

  it('records the update against the local entry', async () => {
    const { JournalRepository } = require('../../repositories');
    primeQueue([updateOperation()]);

    await SyncEngine._pushLocalChanges();

    expect(JournalRepository.markSynced).toHaveBeenCalledWith('local-xyz');
  });
});

describe('batch sync deletes still work', () => {
  let hub;

  beforeEach(() => {
    jest.clearAllMocks();
    hub = createFakeHub();
    ApiClient.post.mockImplementation(hub.handle);
  });

  it('marks a delete completed from the plain string list the server returns', async () => {
    const queue = primeQueue([
      {
        id: 'op-delete-1',
        type: 'delete_entry',
        entityId: 'local-gone',
        serverId: 'srv-7',
        data: { local_id: 'local-gone' },
      },
    ]);

    const result = await SyncEngine._pushLocalChanges();

    expect(result.succeeded).toBe(1);
    expect(queue.completed.has('op-delete-1')).toBe(true);
  });
});

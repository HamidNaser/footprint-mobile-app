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
 * A stand-in for the Hub, serving both doors a create can go through.
 *
 * POST /journals/sync reads ONLY `clientId` out of a create, because that is the only
 * name CreateSyncEntry binds, and it answers with SyncResultItem objects for both
 * `created` and `updated`, because that is what BatchSyncResponse declares. `deleted`
 * really is a list of strings.
 *
 * POST /journals/entries is the single-entry create the fallback uses, and it is the
 * dangerous one: CreateJournalEntryRequest has no ClientId field at all and the
 * controller never sets one, so there is no idempotency guard and the stored row carries
 * no correlation id. Anything sent twice down this door becomes two memories. The fake
 * has to serve it, or a test cannot tell a fallback that duplicates from one that does
 * not -- which is precisely how a green test came to assert the opposite of the truth.
 */
function createFakeHub() {
  const stored = [];
  const byClientId = new Map(); // stands in for the unique {UserId, ClientId} index

  // JsonIgnoreCondition.WhenWritingNull is configured Hub-wide, so a null `clientId` is
  // not serialised as null -- the key is absent from the reply altogether.
  const resultItem = (clientId, serverId) => {
    const item = { serverId, serverTimestamp: SERVER_TIME };
    if (clientId != null) {
      item.clientId = clientId;
    }
    return item;
  };

  const handleBatch = (body) => {
    const created = [];

    for (const create of body.creates || []) {
      const clientId = create.clientId ?? null;

      // The server's idempotency guard. With no clientId it does not run at all.
      if (clientId) {
        const already = byClientId.get(clientId);
        if (already) {
          created.push(resultItem(clientId, already));
          continue;
        }
      }

      const serverId = `srv-${stored.length + 1}`;
      stored.push({ serverId, clientId, title: create.title ?? null, via: 'batch' });
      if (clientId) {
        byClientId.set(clientId, serverId);
      }
      created.push(resultItem(clientId, serverId));
    }

    const updated = (body.updates || []).map((update) =>
      resultItem(update.clientId ?? null, update.serverId)
    );

    return {
      created,
      updated,
      deleted: body.deletes || [],
      conflicts: [],
      serverTimestamp: SERVER_TIME,
    };
  };

  // POST /journals/entries. No correlation id is bound, so no guard can run: every call
  // stores another memory. Answers with a JournalEntryResponse, which carries `id` and
  // -- deliberately -- no client id to match anything against later.
  const handleSingleCreate = (body) => {
    const serverId = `srv-${stored.length + 1}`;
    stored.push({ serverId, clientId: null, title: body.title ?? null, via: 'single' });
    return { id: serverId, journalId: body.journalId, createdAt: SERVER_TIME };
  };

  const handle = async (url, payload) => {
    // The fake is handed the live JS object, so a key whose value is `undefined` reads as
    // present where the wire would have dropped it entirely. Round-trip it through JSON so
    // the fake sees exactly what the server would.
    const body = JSON.parse(JSON.stringify(payload ?? {}));

    return String(url).endsWith('/journals/entries')
      ? handleSingleCreate(body)
      : handleBatch(body);
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

function singleCreateCalls() {
  return ApiClient.post.mock.calls.filter(([url]) => String(url).endsWith('/journals/entries'));
}

/**
 * What ApiClient.request actually throws, reproduced from src/api/ApiClient.js so these
 * tests exercise the real shapes rather than an invented one:
 *
 *   timeout   -> ApiError.timeoutError()   : AbortError from _fetchWithTimeout's
 *                                            AbortController. status 0, code 'TIMEOUT'.
 *   network   -> ApiError.networkError(m)  : any other fetch rejection. status 0,
 *                                            code 'NETWORK_ERROR'.
 *   offline   -> ApiError.offlineError()   : thrown before fetch is called at all.
 *                                            status 0, code 'OFFLINE'.
 *   rejected  -> _handleResponse           : status from the response, data = its body.
 */
const apiErrors = {
  timeout: () =>
    Object.assign(new Error('Request timed out'), {
      name: 'ApiError', status: 0, code: 'TIMEOUT', data: null, isNetworkError: true,
    }),
  network: () =>
    Object.assign(new Error('Network request failed'), {
      name: 'ApiError', status: 0, code: 'NETWORK_ERROR', data: null, isNetworkError: true,
    }),
  offline: () =>
    Object.assign(new Error('No internet connection'), {
      name: 'ApiError', status: 0, code: 'OFFLINE', data: null, isNetworkError: true,
    }),
  serverError: () =>
    Object.assign(new Error('Request failed with status 502'), {
      name: 'ApiError', status: 502, code: 'API_ERROR', data: null, isServerError: true,
    }),
  rejected: () =>
    Object.assign(new Error('Validation failed: {"Creates":["Date is required"]}'), {
      name: 'ApiError',
      status: 400,
      code: 'API_ERROR',
      data: { title: 'One or more validation errors occurred', errors: { Creates: ['Date is required'] } },
      isClientError: true,
    }),
};

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

    // conflictDetails arrives with the refused-memory work (PR #44). Kept inside toEqual
    // rather than loosened to toMatchObject: the strictness is the point -- an
    // unexpected field appearing in this result is exactly what this assertion should
    // catch, and it did.
    expect(result).toEqual({ succeeded: 1, failed: 0, conflicts: 0, conflictDetails: [] });
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

  it('does not match a reply item that carries no correlation id', async () => {
    // Two creates with no local_id. Both come back with `clientId` absent -- the Hub omits
    // a null rather than writing one -- so `undefined === undefined` matched the FIRST
    // such operation both times: it was claimed twice, its local row stamped with the
    // second memory's server id, and the other operation was never claimed at all. That
    // one stays pending forever and is re-pushed with no correlation id on every sync,
    // which the server cannot deduplicate.
    const { JournalRepository } = require('../../repositories');
    const nameless = (id, entityId) => ({
      id,
      type: 'create_entry',
      entityId,
      serverId: null,
      data: {
        journal_id: 'j1',
        date: '2026-08-05',
        title: `Untitled ${id}`,
        content_blocks: '[]',
        visibility: 'private',
      },
    });
    const queue = primeQueue([nameless('op-a', 'local-a'), nameless('op-b', 'local-b')]);

    await SyncEngine._pushLocalChanges();

    // Neither reply can be correlated, so neither operation may be claimed -- and above
    // all neither may be claimed twice.
    expect(JournalRepository.markSynced).not.toHaveBeenCalled();
    expect(queue.completed.size).toBe(0);
  });
});

describe('a batch whose reply is lost does not duplicate the memory', () => {
  let hub;

  beforeEach(() => {
    jest.clearAllMocks();
    hub = createFakeHub();
    ApiClient.post.mockImplementation(hub.handle);
  });

  /** The batch commits, then the reply is dropped on the way back. */
  const loseTheReplyOnce = (makeError) => {
    let lost = false;
    ApiClient.post.mockImplementation(async (url, payload) => {
      const response = await hub.handle(url, payload);
      if (!lost && String(url).endsWith('/journals/sync')) {
        lost = true;
        throw makeError();
      }
      return response;
    });
  };

  it('does not make a second memory when the batch commits and the reply times out', async () => {
    // The commonest mobile failure: _fetchWithTimeout's AbortController fires while the
    // server has already written the entry. The phone cannot tell that from a request
    // that never arrived, so it must not re-send the create down POST /journals/entries,
    // which has no idempotency guard. Leaving it pending costs one sync interval; the
    // next batch is keyed on clientId and settles it against the memory already there.
    primeQueue([createOperation()]);
    loseTheReplyOnce(apiErrors.timeout);

    await SyncEngine._pushLocalChanges();
    await SyncEngine._pushLocalChanges();

    expect(hub.stored).toHaveLength(1);
    expect(hub.stored[0]).toMatchObject({ serverId: 'srv-1', clientId: 'local-abc' });
    expect(singleCreateCalls()).toHaveLength(0);
  });

  it('leaves the create pending rather than failing it, so the next batch can settle it', async () => {
    const queue = primeQueue([createOperation()]);
    loseTheReplyOnce(apiErrors.timeout);

    const result = await SyncEngine._pushLocalChanges();

    // Not completed, not failed: pending. markFailed would burn one of the operation's
    // finite retries for a request the server may well have honoured.
    expect(queue.completed.has('op-create-1')).toBe(false);
    expect(queue.failed.has('op-create-1')).toBe(false);
    // conflictDetails arrives with the refused-memory work (PR #44). Kept inside toEqual
    // rather than loosened to toMatchObject: the strictness is the point -- an
    // unexpected field appearing in this result is exactly what this assertion should
    // catch, and it did.
    expect(result).toEqual({ succeeded: 0, failed: 0, conflicts: 0, conflictDetails: [] });

    const settled = await SyncEngine._pushLocalChanges();
    expect(settled.succeeded).toBe(1);
    expect(queue.completed.has('op-create-1')).toBe(true);
    expect(hub.stored).toHaveLength(1);
  });

  it.each([
    ['a bare connection failure', apiErrors.network],
    ['a 5xx, which a gateway can send after the origin committed', apiErrors.serverError],
  ])('holds the create back on %s too', async (_name, makeError) => {
    primeQueue([createOperation()]);
    loseTheReplyOnce(makeError);

    await SyncEngine._pushLocalChanges();
    await SyncEngine._pushLocalChanges();

    expect(hub.stored).toHaveLength(1);
    expect(singleCreateCalls()).toHaveLength(0);
  });

  it('still falls back for a create when the server answered and rejected the batch', async () => {
    // A 4xx is the server itself saying it refused the payload, so nothing was written and
    // the single-entry endpoint is safe. Holding every create back on every failure would
    // be the easy fix and the wrong one -- it would strand creates the batch will never
    // accept.
    primeQueue([createOperation()]);
    ApiClient.post.mockImplementation(async (url, payload) => {
      if (String(url).endsWith('/journals/sync')) {
        throw apiErrors.rejected();
      }
      return hub.handle(url, payload);
    });

    const result = await SyncEngine._pushLocalChanges();

    expect(singleCreateCalls()).toHaveLength(1);
    expect(result.succeeded).toBe(1);
    expect(hub.stored).toHaveLength(1);
  });

  it('falls back for a create when the phone never sent the batch at all', async () => {
    // offlineError is thrown before fetch is called, so the server provably saw nothing.
    primeQueue([createOperation()]);
    ApiClient.post.mockImplementation(async (url, payload) => {
      if (String(url).endsWith('/journals/sync')) {
        throw apiErrors.offline();
      }
      return hub.handle(url, payload);
    });

    await SyncEngine._pushLocalChanges();

    expect(singleCreateCalls()).toHaveLength(1);
  });

  it('keeps falling back for updates and deletes, which are idempotent', async () => {
    primeQueue([
      createOperation(),
      {
        id: 'op-update-1',
        type: 'update_entry',
        entityId: 'local-xyz',
        serverId: 'srv-9',
        data: { local_id: 'local-xyz', journal_id: 'j1', date: '2026-08-06', content_blocks: '[]', updated_at: '2026-08-06T12:00:00.000Z' },
      },
      {
        id: 'op-delete-1',
        type: 'delete_entry',
        entityId: 'local-gone',
        serverId: 'srv-7',
        data: { local_id: 'local-gone' },
      },
    ]);
    ApiClient.patch.mockResolvedValue({ id: 'srv-9' });
    ApiClient.delete.mockResolvedValue(null);
    loseTheReplyOnce(apiErrors.timeout);

    const result = await SyncEngine._pushLocalChanges();

    // A re-sent PATCH or DELETE cannot make a second memory, so holding them back would
    // only delay them for nothing.
    expect(ApiClient.patch).toHaveBeenCalledTimes(1);
    expect(ApiClient.delete).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toBe(2);
    // The create alone is held back.
    expect(singleCreateCalls()).toHaveLength(0);
  });
});

describe('a failed local write does not re-send what the batch already accepted', () => {
  let hub;

  beforeEach(() => {
    jest.clearAllMocks();
    hub = createFakeHub();
    ApiClient.post.mockImplementation(hub.handle);
  });

  it('does not make a second memory when markSynced throws', async () => {
    // markSynced and markCompleted are SQLite writes, and they used to sit inside the try
    // whose catch re-sends everything. A locked database therefore re-created, down the
    // unguarded single-entry endpoint, entries the server had just accepted.
    const { JournalRepository } = require('../../repositories');
    primeQueue([createOperation()]);
    JournalRepository.markSynced.mockRejectedValueOnce(
      Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' })
    );

    await SyncEngine._pushLocalChanges();

    expect(hub.stored).toHaveLength(1);
    expect(singleCreateCalls()).toHaveLength(0);
  });

  it('does not re-send an update the batch had already settled', async () => {
    // The structural half of the same defect, and the half a create-only guard does not
    // cover: whatever the batch settled before the throw must not be sent again, whatever
    // its type. Only the network call belongs inside the fallback's try.
    const { JournalRepository } = require('../../repositories');
    primeQueue([
      {
        id: 'op-update-1',
        type: 'update_entry',
        entityId: 'local-xyz',
        serverId: 'srv-9',
        data: { local_id: 'local-xyz', journal_id: 'j1', date: '2026-08-06', content_blocks: '[]', updated_at: '2026-08-06T12:00:00.000Z' },
      },
    ]);
    JournalRepository.markSynced.mockRejectedValueOnce(new Error('disk I/O error'));

    await SyncEngine._pushLocalChanges();

    expect(ApiClient.patch).not.toHaveBeenCalled();
    expect(batchSyncCalls()).toHaveLength(1);
  });

  it('does not report a local write failure as a sync success', async () => {
    const { JournalRepository } = require('../../repositories');
    const queue = primeQueue([createOperation()]);
    JournalRepository.markSynced.mockRejectedValueOnce(new Error('database is locked'));

    const result = await SyncEngine._pushLocalChanges();

    expect(result.succeeded).toBe(0);
    // Still pending, so the next batch -- idempotent on clientId -- finishes the job
    // against the memory already on the server rather than making another.
    expect(queue.completed.has('op-create-1')).toBe(false);

    JournalRepository.markSynced.mockResolvedValue(undefined);
    const retried = await SyncEngine._pushLocalChanges();

    expect(retried.succeeded).toBe(1);
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

    // conflictDetails arrives with the refused-memory work (PR #44). Kept inside toEqual
    // rather than loosened to toMatchObject: the strictness is the point -- an
    // unexpected field appearing in this result is exactly what this assertion should
    // catch, and it did.
    expect(result).toEqual({ succeeded: 1, failed: 0, conflicts: 0, conflictDetails: [] });
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

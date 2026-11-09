/**
 * A memory whose audience the server could not apply must stop being pretended about -- and
 * must never be shared with anybody else instead.
 *
 * The Hub saves such a memory's content and tells the phone it could not work out who may see
 * it: on the batch route as `unresolvedAudience: [{ clientId, reason }]`, and on the
 * single-operation route as a problem response whose title begins "The audience for this
 * entry". `reason` is one of exactly two tokens -- `source_unavailable`, send it again later,
 * and `do_not_resend`, never. The phone read neither, so the operation sat pending and was
 * re-sent forever with nothing shown anywhere: the silent sharing failure CLAUDE.md's
 * *Sharing fails closed* rule exists to forbid (research R15, FR-011, SC-010).
 *
 * ## The four rules these pin, each settled in an analyze round and not to be re-litigated
 *
 *   1. `journal_entries.share_state` is the ONLY record of what the server said. A refusal
 *      produces no `sync_queue` conflict row, so the sync badge's "N not sent" never counts it
 *      and `getConflictedOperations()` never lists it -- it is shown on the memory's own card
 *      and nowhere else (round-2 D1 and H1; the owner: card only).
 *   2. When one item carries BOTH signals -- a conflict "Entry not found" and an
 *      `unresolvedAudience` `do_not_resend`, which the Hub sends together on purpose for an
 *      update to an entry that is gone -- the conflict wins: today's handling settles it and
 *      `share_state` stays unset (round-3 H2, the owner's own choice).
 *   3. A `waiting` share never spends a retry and never counts as failed: `returnToPending`
 *      leaves `retry_count` alone, and `markFailed` is never called on the single-operation
 *      audience path (round-3 H1).
 *   4. Nothing, on any of these paths, changes the memory's visibility. Not as a fallback, not
 *      on a retry, not on a refusal. SC-010 is measured in zeroes, so the tests below read the
 *      stored row back column by column rather than taking the absence of a write on trust.
 *
 * ## Why so little of this is mocked
 *
 * The engine, the queue, the conflict resolver, `DatabaseService` and `JournalRepository` are
 * all the real ones, over a real SQLite engine running production's own schema -- `expo-sqlite`
 * is native and cannot load under jest, so the connection is Node's SQLite, as
 * `SyncEngine.batchConflicts.test.js` and `upgradePaths.test.js` already do. The whole defect
 * is a value that was dropped between layers, so a test that stopped at a mocked repository and
 * asserted "setShareState was called" would prove nothing about `share_state` ever being
 * written, and nothing at all about the visibility column being left alone. Only the network
 * and the native modules are substituted.
 */

import { refusedMemoriesFrom } from '../../utils/refusedMemories';

// ============================================================
// The local database: a real SQLite engine running production's schema
// ============================================================

jest.mock('../../database', () => {
  const { DatabaseSync: Sqlite } = require('node:sqlite');
  const { CREATE_TABLES, CREATE_INDEXES } = require('../../database/schema');

  let raw = null;

  /**
   * expo-sqlite coerces an `undefined` bind parameter to NULL; node:sqlite throws on it.
   * Coerced here so the fake driver is faithful to the real one.
   */
  const bind = (params = []) => params.map((p) => (p === undefined ? null : p));

  const connection = {
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params) => raw.prepare(sql).run(...bind(params)),
    getFirstAsync: async (sql, params) => raw.prepare(sql).get(...bind(params)) ?? null,
    getAllAsync: async (sql, params) => raw.prepare(sql).all(...bind(params)),
    closeAsync: async () => {},
    withTransactionAsync: async (fn) => {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };

  return {
    __rawDb: () => raw,
    __freshDatabase: () => {
      if (raw) raw.close();
      // A fresh install, built the way production builds one.
      raw = new Sqlite(':memory:');
      for (const create of Object.values(CREATE_TABLES)) raw.exec(create);
      for (const index of CREATE_INDEXES) raw.exec(index);
      return raw;
    },
    getDatabase: async () => connection,
    initializeDatabase: async () => connection,
    clearDatabase: async () => {},
    closeDatabase: async () => {},
    getDatabaseStats: async () => ({}),
  };
});

// ============================================================
// Everything the engine talks to apart from its own storage
// ============================================================

const mockServer = {
  batchSync: jest.fn(),
  createEntry: jest.fn(),
  updateEntry: jest.fn(),
  deleteEntry: jest.fn(),
  getChanges: jest.fn(async () => ({ entries: [], deletedIds: [], serverTimestamp: null })),
};

jest.mock('../../api/JournalApi', () => ({
  JournalApi: mockServer,
}));

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {},
  ApiError: class ApiError extends Error {},
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
    isSyncEnabled: jest.fn(async () => true),
  },
  StorageMode: { LOCAL_ONLY: 'local_only', CLOUD_SYNC: 'cloud_sync' },
}));

jest.mock('../../services/JournalService', () => ({
  JournalService: {
    _queueMediaForUpload: jest.fn(async () => {}),
    fileService: { getFileInfo: jest.fn(async () => null) },
  },
}));

// Imported after the mocks are declared.
const { __freshDatabase, __rawDb } = require('../../database');
const { SyncEngine } = require('../SyncEngine');
const { SyncQueue, SyncOperationType, OperationStatus } = require('../SyncQueue');
const { DatabaseService } = require('../../services/DatabaseService');
const { JournalRepository } = require('../../repositories');

// ============================================================
// Fixtures
// ============================================================

/** The server accepted everything, and had no trouble with any audience. */
const acceptedEverything = () => ({
  created: [],
  updated: [],
  deleted: [],
  conflicts: [],
  unresolvedAudience: [],
  serverTimestamp: '2026-11-09T10:00:00.000Z',
});

/**
 * One memory on the phone, saved with an explicit audience the person chose. `visibility` is
 * the field no refusal may ever change, so it is given a value that is plainly not the
 * narrowest one -- a fallback to `private` would be as wrong as a fallback to `public`, and a
 * default of `private` everywhere would hide the first of those.
 */
async function seedEntry(localId, { serverId = null, visibility = 'family', shareState = null } = {}) {
  await DatabaseService.insertEntry({
    localId,
    serverId,
    journalId: 'journal-1',
    userId: 'user-1',
    date: '2026-11-08',
    contentBlocks: [{ type: 'text', content: 'The lake, late on', order: 0 }],
    visibility,
    locationSharing: 'family',
    syncStatus: 'pending',
  });
  if (shareState) await JournalRepository.setShareState(localId, shareState);
}

/** The stored row, exactly as SQLite holds it. */
const storedRow = (localId) =>
  __rawDb().prepare('SELECT * FROM journal_entries WHERE local_id = ?').get(localId);

/** The columns that say who may see this memory. SC-010 is measured on these. */
const audienceColumnsOf = (localId) => {
  const row = storedRow(localId);
  return { visibility: row.visibility, location_sharing: row.location_sharing };
};

/** A problem response of the shape AudienceRefusalExtensions.AudienceCouldNotBeDetermined builds. */
function audienceProblem(status) {
  const error = new Error(
    status === 422
      ? 'The audience for this entry can never be determined, so nothing was saved and sending it again will not help.'
      : 'The audience for this entry could not be determined, so nothing was saved.'
  );
  error.status = status;
  error.data = {
    status,
    title:
      status === 422
        ? 'The audience for this entry can never be determined, so nothing was saved and sending it again will not help.'
        : 'The audience for this entry could not be determined, so nothing was saved.',
    detail: 'The custom group this entry is shared with could not be read.',
    reason: status === 422 ? 'do_not_resend' : 'source_unavailable',
  };
  return error;
}

/** A batch failure that does NOT prove the request never landed, so creates are held back. */
function batchUnreachable() {
  const error = new Error('Network request failed');
  error.code = 'NETWORK_ERROR';
  return error;
}

let markConflict;
let markFailed;
let markInProgress;
let warn;

beforeEach(async () => {
  __freshDatabase();
  // The service caches its connection; the connection proxies whichever database is current,
  // so a fresh one per test needs no re-initialisation.
  await DatabaseService.initialize();

  jest.clearAllMocks();
  mockServer.batchSync.mockImplementation(async () => acceptedEverything());
  mockServer.getChanges.mockImplementation(async () => ({
    entries: [],
    deletedIds: [],
    serverTimestamp: null,
  }));

  // Spies over the REAL queue methods, so these assert what production called while
  // production still does it.
  markConflict = jest.spyOn(SyncQueue, 'markConflict');
  markFailed = jest.spyOn(SyncQueue, 'markFailed');
  markInProgress = jest.spyOn(SyncQueue, 'markInProgress');
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ============================================================
// The batch route
// ============================================================

describe('a batch reply saying the audience could not be determined yet (source_unavailable)', () => {
  it('marks the memory as waiting to share and sends it again by itself', async () => {
    await seedEntry('local-1');
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-1',
      data: { local_id: 'local-1' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-1', reason: 'source_unavailable' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect((await DatabaseService.getEntryByLocalId('local-1')).shareState).toBe('waiting');

    // Back in the queue, and offered for pushing again -- which is what "the phone retries by
    // itself" means in FR-011.
    const operation = await SyncQueue.getOperation(operationId);
    expect(operation.status).toBe(OperationStatus.PENDING);
    expect((await SyncQueue.getPendingOperations()).map((op) => op.id)).toContain(operationId);
  });

  it('spends none of the retry budget, and counts as neither failed nor refused', async () => {
    await seedEntry('local-1');
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-1',
      data: { local_id: 'local-1' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-1', reason: 'source_unavailable' }],
    }));

    const result = await SyncEngine._pushLocalChanges();

    expect((await SyncQueue.getOperation(operationId)).retryCount).toBe(0);
    expect(markFailed).not.toHaveBeenCalled();
    expect(markConflict).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect(result.conflicts).toBe(0);
    expect(result.conflictDetails).toEqual([]);

    // What SyncContext reads for the badge. Nothing to say, which is the point.
    const stats = await SyncQueue.getStats();
    expect(stats.failed).toBe(0);
    expect(stats.conflict).toBe(0);
  });

  it('leaves who may see the memory exactly as the person chose it', async () => {
    await seedEntry('local-1', { visibility: 'family' });
    const before = audienceColumnsOf('local-1');
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-1',
      data: { local_id: 'local-1' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-1', reason: 'source_unavailable' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect(audienceColumnsOf('local-1')).toEqual(before);
    expect(audienceColumnsOf('local-1').visibility).toBe('family');
  });
});

describe('a batch reply saying the audience can never be determined (do_not_resend)', () => {
  it('marks the memory as refused and takes the operation out of the queue', async () => {
    await seedEntry('local-2');
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-2',
      data: { local_id: 'local-2' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-2', reason: 'do_not_resend' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect((await DatabaseService.getEntryByLocalId('local-2')).shareState).toBe('refused');
    expect(await SyncQueue.getOperation(operationId)).toBeNull();
  });

  it('stops re-sending it, rather than asking a question already answered no', async () => {
    await seedEntry('local-2');
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-2',
      data: { local_id: 'local-2' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-2', reason: 'do_not_resend' }],
    }));

    await SyncEngine._pushLocalChanges();

    mockServer.batchSync.mockClear();
    await SyncEngine._pushLocalChanges();
    expect(mockServer.batchSync).not.toHaveBeenCalled();
  });

  it('writes no conflict row, so the sync badge never counts it (round-2 D1, H1)', async () => {
    // `share_state` is the only record. A conflict row would be a second record of one
    // fact, and it would reach the person as "1 memory not sent" on the badge -- which is
    // not what happened, and not where the owner decided this is shown.
    await seedEntry('local-2');
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-2',
      data: { local_id: 'local-2' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-2', reason: 'do_not_resend' }],
    }));

    const result = await SyncEngine._pushLocalChanges();

    expect(markConflict).not.toHaveBeenCalled();
    expect(markFailed).not.toHaveBeenCalled();

    const stats = await SyncQueue.getStats();
    expect(stats.conflict).toBe(0);
    expect(stats.failed).toBe(0);
    expect(await SyncQueue.getConflictedOperations()).toEqual([]);
    expect(refusedMemoriesFrom(await SyncQueue.getConflictedOperations())).toEqual([]);
    expect(result.conflicts).toBe(0);
    expect(result.conflictDetails).toEqual([]);
  });

  it('leaves who may see the memory exactly as the person chose it', async () => {
    await seedEntry('local-2', { visibility: 'friends' });
    const before = audienceColumnsOf('local-2');
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-2',
      data: { local_id: 'local-2' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-2', reason: 'do_not_resend' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect(audienceColumnsOf('local-2')).toEqual(before);
    expect(audienceColumnsOf('local-2').visibility).toBe('friends');
  });
});

describe('an unresolvedAudience item that cannot be matched to anything', () => {
  it('is reported rather than swallowed when it carries no clientId', async () => {
    await seedEntry('local-3');
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-3',
      data: { local_id: 'local-3' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ reason: 'do_not_resend' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('clientId'),
      expect.anything()
    );

    // And nothing was guessed at: no memory is marked on the strength of an item that
    // identifies none, and the operation is left for the next batch, which can correlate it.
    expect((await DatabaseService.getEntryByLocalId('local-3')).shareState).toBeNull();
    expect((await SyncQueue.getOperation(operationId)).status).toBe(OperationStatus.PENDING);
  });

  it('is reported when its clientId matches no queued operation', async () => {
    await seedEntry('local-3');
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-3',
      data: { local_id: 'local-3' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [{ clientId: 'local-somebody-else', reason: 'do_not_resend' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('matches no queued operation'),
      expect.anything()
    );
    expect((await DatabaseService.getEntryByLocalId('local-3')).shareState).toBeNull();
  });
});

describe('one item carrying both signals at once (round-3 H2)', () => {
  /**
   * For an update to an entry that is no longer on the server, the Hub deliberately sends
   * BOTH a conflict "Entry not found" and an `unresolvedAudience` `do_not_resend`
   * (`JournalsController.BatchSync`, the lookup arm). The owner ruled that the conflict
   * wins: "deleted on another device" is the true account of what happened, and a memory
   * that no longer exists is not a memory waiting for an audience.
   */
  const bothSignals = () => ({
    ...acceptedEverything(),
    conflicts: [{ clientId: 'local-4', serverId: 'srv-4', reason: 'Entry not found' }],
    unresolvedAudience: [{ clientId: 'local-4', reason: 'do_not_resend' }],
  });

  async function queueTheUpdate() {
    await seedEntry('local-4', { serverId: 'srv-4' });
    return SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-4',
      serverId: 'srv-4',
      data: { local_id: 'local-4' },
    });
  }

  it("is settled by today's conflict handling", async () => {
    const operationId = await queueTheUpdate();
    mockServer.batchSync.mockImplementation(async () => bothSignals());

    const result = await SyncEngine._pushLocalChanges();

    expect(markConflict).toHaveBeenCalledTimes(1);
    const settled = await SyncQueue.getOperation(operationId);
    expect(settled.status).toBe(OperationStatus.CONFLICT);
    expect(settled.conflictData.reason).toBe('Entry not found');
    expect(result.conflicts).toBe(1);
  });

  it("keeps today's words for it: deleted on another device", async () => {
    await queueTheUpdate();
    mockServer.batchSync.mockImplementation(async () => bothSignals());

    await SyncEngine._pushLocalChanges();

    expect(refusedMemoriesFrom(await SyncQueue.getConflictedOperations())).toEqual([
      expect.objectContaining({
        why: 'This memory was deleted on another device, so your change could not be saved.',
      }),
    ]);
  });

  it('leaves share_state unset, so there is still exactly one record', async () => {
    await queueTheUpdate();
    mockServer.batchSync.mockImplementation(async () => bothSignals());

    await SyncEngine._pushLocalChanges();

    expect((await DatabaseService.getEntryByLocalId('local-4')).shareState).toBeNull();
    expect(storedRow('local-4').share_state).toBeNull();
  });
});

describe('two queued updates for the same memory, both refused (round-4 U2)', () => {
  it('removes both of them in one sync', async () => {
    // The Hub answers per update, so two queued edits to one entry come back as two items
    // carrying the same clientId. Settling only the first leaves the second re-sending a
    // memory the server has already refused for good -- the loop this whole change closes.
    await seedEntry('local-5', { serverId: 'srv-5' });
    const first = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-5',
      serverId: 'srv-5',
      data: { local_id: 'local-5', content: 'first edit' },
    });
    const second = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-5',
      serverId: 'srv-5',
      data: { local_id: 'local-5', content: 'second edit' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      unresolvedAudience: [
        { clientId: 'local-5', reason: 'do_not_resend' },
        { clientId: 'local-5', reason: 'do_not_resend' },
      ],
    }));

    await SyncEngine._pushLocalChanges();

    expect(await SyncQueue.getOperation(first)).toBeNull();
    expect(await SyncQueue.getOperation(second)).toBeNull();
    expect((await DatabaseService.getEntryByLocalId('local-5')).shareState).toBe('refused');
    expect(await SyncQueue.getPendingOperations()).toEqual([]);
  });
});

// ============================================================
// The single-operation fallback
// ============================================================

describe('the single-operation route, when the batch could not be reached (round-2 M6)', () => {
  /**
   * The operation is `in_progress` by the time the server answers -- `_processSingleOperation`
   * marks it so before it calls out -- which is exactly why `cancelOperation`, which deletes
   * only `pending` rows, cannot settle one of these.
   */
  it('503 with an audience problem: waiting, back in the queue, and never marked failed', async () => {
    await seedEntry('local-6', { serverId: 'srv-6' });
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-6',
      serverId: 'srv-6',
      data: { local_id: 'local-6' },
    });

    mockServer.batchSync.mockImplementation(async () => {
      throw batchUnreachable();
    });
    mockServer.updateEntry.mockImplementation(async () => {
      throw audienceProblem(503);
    });

    const result = await SyncEngine._pushLocalChanges();

    expect(markInProgress).toHaveBeenCalledWith(operationId);
    expect((await DatabaseService.getEntryByLocalId('local-6')).shareState).toBe('waiting');

    const operation = await SyncQueue.getOperation(operationId);
    expect(operation.status).toBe(OperationStatus.PENDING);
    expect(operation.retryCount).toBe(0);
    expect(markFailed).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect(result.succeeded).toBe(0);
    expect((await SyncQueue.getStats()).failed).toBe(0);
  });

  it('422 with an audience problem: refused, out of the queue, and never marked failed', async () => {
    // A create, because the first upload of a brand-new memory is the case a person meets:
    // they chose an audience, the server cannot apply it, and nothing may be shared. The
    // batch is refused with a 400, which proves it never landed, so the create may be
    // re-sent on its own.
    await seedEntry('local-7');
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-7',
      data: { local_id: 'local-7' },
    });

    const batchRefused = new Error('Request failed with status 400');
    batchRefused.status = 400;
    mockServer.batchSync.mockImplementation(async () => {
      throw batchRefused;
    });
    mockServer.createEntry.mockImplementation(async () => {
      throw audienceProblem(422);
    });

    const result = await SyncEngine._pushLocalChanges();

    expect((await DatabaseService.getEntryByLocalId('local-7')).shareState).toBe('refused');
    expect(await SyncQueue.getOperation(operationId)).toBeNull();
    expect(markFailed).not.toHaveBeenCalled();
    expect(markConflict).not.toHaveBeenCalled();
    expect(result.failed).toBe(0);
    expect((await SyncQueue.getStats()).failed).toBe(0);
    expect((await SyncQueue.getStats()).conflict).toBe(0);
  });

  it('leaves who may see the memory exactly as the person chose it', async () => {
    await seedEntry('local-6', { serverId: 'srv-6', visibility: 'friends' });
    const before = audienceColumnsOf('local-6');
    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-6',
      serverId: 'srv-6',
      data: { local_id: 'local-6' },
    });

    mockServer.batchSync.mockImplementation(async () => {
      throw batchUnreachable();
    });
    mockServer.updateEntry.mockImplementation(async () => {
      throw audienceProblem(422);
    });

    await SyncEngine._pushLocalChanges();

    expect(audienceColumnsOf('local-6')).toEqual(before);
    expect(audienceColumnsOf('local-6').visibility).toBe('friends');
  });

  it.each([503, 422])('keeps today\'s handling for any OTHER %s', async (status) => {
    // Only an audience refusal is an audience refusal. A 503 because the service is down,
    // or a 422 because the payload was wrong, is a failure like any other: marked failed,
    // a retry spent, and no claim made about who may see the memory.
    await seedEntry('local-8', { serverId: 'srv-8' });
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-8',
      serverId: 'srv-8',
      data: { local_id: 'local-8' },
    });

    mockServer.batchSync.mockImplementation(async () => {
      throw batchUnreachable();
    });
    mockServer.updateEntry.mockImplementation(async () => {
      const error = new Error('Service temporarily unavailable');
      error.status = status;
      error.data = { status, title: 'Service temporarily unavailable' };
      throw error;
    });

    const result = await SyncEngine._pushLocalChanges();

    expect(markFailed).toHaveBeenCalledWith(operationId, expect.any(String));
    const operation = await SyncQueue.getOperation(operationId);
    expect(operation.status).toBe(OperationStatus.FAILED);
    expect(operation.retryCount).toBe(1);
    expect(result.failed).toBe(1);
    expect((await DatabaseService.getEntryByLocalId('local-8')).shareState).toBeNull();
  });

  it('keeps today\'s handling for a failure that carries no problem body at all', async () => {
    await seedEntry('local-9', { serverId: 'srv-9' });
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-9',
      serverId: 'srv-9',
      data: { local_id: 'local-9' },
    });

    mockServer.batchSync.mockImplementation(async () => {
      throw batchUnreachable();
    });
    mockServer.updateEntry.mockImplementation(async () => {
      throw new Error('Request timed out');
    });

    await SyncEngine._pushLocalChanges();

    expect(markFailed).toHaveBeenCalledWith(operationId, expect.any(String));
    expect((await DatabaseService.getEntryByLocalId('local-9')).shareState).toBeNull();
  });
});

// ============================================================
// Getting better
// ============================================================

describe('a later successful upload', () => {
  it('clears the refusal, because the server has now accepted the memory', async () => {
    await seedEntry('local-10', { shareState: 'refused' });
    expect((await DatabaseService.getEntryByLocalId('local-10')).shareState).toBe('refused');

    // The person chose an audience again, so the memory is queued once more.
    await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-10',
      data: { local_id: 'local-10' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      created: [{ clientId: 'local-10', serverId: 'srv-10', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
    }));

    const result = await SyncEngine._pushLocalChanges();

    expect(result.succeeded).toBe(1);
    const entry = await DatabaseService.getEntryByLocalId('local-10');
    expect(entry.shareState).toBeNull();
    expect(entry.serverId).toBe('srv-10');
  });

  it('clears a waiting share once the server can apply the audience', async () => {
    await seedEntry('local-11', { serverId: 'srv-11', shareState: 'waiting' });
    await SyncQueue.enqueue({
      type: SyncOperationType.UPDATE_ENTRY,
      entityId: 'local-11',
      serverId: 'srv-11',
      data: { local_id: 'local-11' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      ...acceptedEverything(),
      updated: [{ clientId: 'local-11', serverId: 'srv-11', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
    }));

    await SyncEngine._pushLocalChanges();

    expect((await DatabaseService.getEntryByLocalId('local-11')).shareState).toBeNull();
  });
});

describe('a sync with nothing refused', () => {
  it('behaves exactly as it did before any of this existed', async () => {
    // The backward-compatibility case, including a server that sends no `unresolvedAudience`
    // field at all -- which is every server older than feature 006, and every reply where
    // the Hub omitted it as null.
    await seedEntry('local-12');
    const operationId = await SyncQueue.enqueue({
      type: SyncOperationType.CREATE_ENTRY,
      entityId: 'local-12',
      data: { local_id: 'local-12' },
    });

    mockServer.batchSync.mockImplementation(async () => ({
      created: [{ clientId: 'local-12', serverId: 'srv-12', serverTimestamp: '2026-11-09T10:00:00.000Z' }],
      updated: [],
      deleted: [],
      conflicts: [],
      serverTimestamp: '2026-11-09T10:00:00.000Z',
    }));

    const result = await SyncEngine._pushLocalChanges();

    expect(result).toEqual(
      expect.objectContaining({ succeeded: 1, failed: 0, conflicts: 0, conflictDetails: [] })
    );
    expect((await SyncQueue.getOperation(operationId)).status).toBe(OperationStatus.COMPLETED);
    expect((await DatabaseService.getEntryByLocalId('local-12')).shareState).toBeNull();
  });
});

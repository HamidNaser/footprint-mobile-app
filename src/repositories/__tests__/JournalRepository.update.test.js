/**
 * What an edit is allowed to put on the sync queue (FR-011, FR-018; research R15, analyze
 * round-4 U1 and round-5 U3).
 *
 * `JournalRepository.update` enqueued an `UPDATE_ENTRY` for every edit, including an edit of a
 * memory the server has never held. There is nothing there to update:
 * `UpdateSyncEntry.ServerId` is a required string, so a batch carrying one is most likely
 * refused whole with 400 -- taking the memories that were fine down with it -- and the
 * single-operation path drops it as completed (`SyncEngine.js:1062-1071`). The memory's own
 * pending `CREATE`, or a later re-share, is what carries the current content, and the push
 * re-reads the row rather than the queued snapshot. So an edit of a not-yet-uploaded memory
 * stores the change and queues nothing, which is the case R15 arrives at from the other
 * direction: a memory whose first upload the server refused for good has no server id and no
 * create left in the queue, and its edits wait on the phone until the person chooses an
 * audience again.
 *
 * ⚠ **The real repository, the real queue and real SQLite, on purpose.** This cannot live in
 * `JournalService.blocks.test.js`, which mocks the repository wholesale -- a fake `update` can
 * only queue what it was written to queue, so it could not see a queueing rule at all, and the
 * fake there deliberately models the old unconditional enqueue. Here `expo-sqlite` (native, and
 * unloadable under jest) is replaced by Node's own SQLite running production's schema, exactly
 * as `src/database/upgradePaths.test.js` does, and every claim about the queue is read back out
 * of the `sync_queue` table itself. "No `UPDATE_ENTRY` was enqueued" is then a statement about
 * the rows that exist, not about a call that was not made on a mock.
 *
 * `FileService` and `SyncEngine` are stubbed because they are not in this: one reaches
 * `expo-file-system`, the other is what `JournalService._syncNow` asks to push.
 */

jest.mock('../../database', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { CREATE_TABLES, CREATE_INDEXES } = require('../../database/schema');

  let raw = null;

  const bind = (params = []) => params.map((p) => (p === undefined ? null : p));

  const connection = {
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params) => raw.prepare(sql).run(...bind(params)),
    getFirstAsync: async (sql, params) => raw.prepare(sql).get(...bind(params)) ?? null,
    getAllAsync: async (sql, params) => raw.prepare(sql).all(...bind(params)),
    closeAsync: async () => {},
  };

  return {
    __rawDb: () => raw,
    __freshDatabase: () => {
      if (raw) raw.close();
      raw = new DatabaseSync(':memory:');
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

jest.mock('../../services/SettingsService', () => ({
  SettingsService: {
    getStorageMode: jest.fn(async () => 'cloud_sync'),
    isSyncEnabled: jest.fn(async () => true),
    getDefaultJournalId: jest.fn(async () => 'journal-1'),
  },
  StorageMode: { LOCAL_ONLY: 'local_only', CLOUD_SYNC: 'cloud_sync' },
}));

jest.mock('../../services/FileService', () => ({
  FileService: {
    persist: jest.fn(async (uri) => uri),
    getFileInfo: jest.fn(async () => ({ size: 2048 })),
  },
  MediaType: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
}));

jest.mock('../../sync/SyncEngine', () => ({
  SyncEngine: { sync: jest.fn(async () => ({})) },
  SyncEvent: { SYNC_COMPLETED: 'sync_completed' },
}));

const { __freshDatabase, __rawDb } = require('../../database');
const { JournalRepository } = require('../JournalRepository');
const { JournalService } = require('../../services/JournalService');
const { DatabaseService } = require('../../services/DatabaseService');
const { SyncQueue, SyncOperationType } = require('../../sync/SyncQueue');
const { SettingsService } = require('../../services/SettingsService');
const { ShareState } = require('../../database/schema');

const BLOCKS = [{ type: 'text', content: 'the quay at dusk', order: 0 }];
const EDITED = [{ type: 'text', content: 'the quay at dusk, tide out', order: 0 }];

/** Every row the sync queue holds, oldest first, as SQLite has them. */
const queueRows = () =>
  __rawDb()
    .prepare('SELECT operation_type, entity_id, server_id, status, payload FROM sync_queue ORDER BY rowid ASC')
    .all();

const storedRow = (localId) =>
  __rawDb().prepare('SELECT * FROM journal_entries WHERE local_id = ?').get(localId);

/** A memory saved on this phone and not yet uploaded: no server id, a pending create queued. */
const savedOnThisPhone = () =>
  JournalRepository.createEntry({
    journalId: 'journal-1',
    userId: 'user-1',
    date: '2026-11-08',
    contentBlocks: BLOCKS,
    visibility: 'family',
  });

/** A memory the server holds, as a pull leaves it. */
const heldByTheServer = () =>
  JournalRepository.createFromServer({
    id: 'srv-1',
    journalId: 'journal-1',
    userId: 'user-1',
    date: '2026-11-08',
    contentBlocks: BLOCKS,
    visibility: 'family',
    updatedAt: '2026-11-08T17:42:09.123Z',
  });

beforeEach(async () => {
  __freshDatabase();
  await DatabaseService.initialize();
  jest.clearAllMocks();
  // Cloud sync on, unless a test says otherwise. Re-set rather than cleared: `clearAllMocks`
  // forgets calls, not implementations, so a test that switches storage off would leak it.
  SettingsService.isSyncEnabled.mockResolvedValue(true);
});

// The mid-save tests below spy on a real object; `clearAllMocks` forgets calls but leaves a spy
// in place, so it has to be put back.
afterEach(() => {
  jest.restoreAllMocks();
});

describe('update, on a memory the server has never held', () => {
  it('stores the edit', async () => {
    const entry = await savedOnThisPhone();

    const updated = await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(updated.contentBlocks).toEqual(EDITED);
    expect(JSON.parse(storedRow(entry.localId).content_blocks)).toEqual(EDITED);
  });

  it('queues no UPDATE_ENTRY, and leaves the pending CREATE to carry the change', async () => {
    const entry = await savedOnThisPhone();

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    // The queue's whole contents, read out of SQLite: the create the save made, and nothing
    // the edit added. An extra row here is an operation the server answers 400 to.
    expect(queueRows()).toEqual([
      expect.objectContaining({
        operation_type: SyncOperationType.CREATE_ENTRY,
        entity_id: entry.localId,
        server_id: null,
        status: 'pending',
      }),
    ]);
    // Still pending, so the push still collects it -- and it reads the row as it stands, so
    // the edit above goes with it.
    expect(await SyncQueue.getPendingOperations()).toHaveLength(1);
  });

  it('queues nothing at all for an edit of a memory whose share the server refused (R15)', async () => {
    // The whole shape of R15's round-3 L4: the create was removed from the queue when the
    // refusal was final, so this memory has no server id AND no queued operation. An edit
    // must not invent one -- an UPDATE_ENTRY with no server id is dropped by the engine as
    // completed, which would leave the memory unshared with nothing on its card to say so.
    const entry = await savedOnThisPhone();
    const [create] = await SyncQueue.getOperationsForEntity(entry.localId);
    await SyncQueue.removeOperation(create.id);
    await JournalRepository.setShareState(entry.localId, ShareState.REFUSED);

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(queueRows()).toEqual([]);
    // The edit is on the phone, and the card still says what is true: not shared.
    expect(JSON.parse(storedRow(entry.localId).content_blocks)).toEqual(EDITED);
    expect(storedRow(entry.localId).share_state).toBe(ShareState.REFUSED);
  });
});

describe('update, on a memory the server holds', () => {
  it('queues exactly one UPDATE_ENTRY, carrying the server id', async () => {
    const entry = await heldByTheServer();

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(queueRows()).toEqual([
      expect.objectContaining({
        operation_type: SyncOperationType.UPDATE_ENTRY,
        entity_id: entry.localId,
        server_id: 'srv-1',
        status: 'pending',
      }),
    ]);
    expect(JSON.parse(queueRows()[0].payload)).toEqual(
      expect.objectContaining({ local_id: entry.localId, contentBlocks: EDITED }),
    );
  });

  it('moves the row back to pending, so the push collects it', async () => {
    const entry = await heldByTheServer();

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(storedRow(entry.localId).sync_status).toBe('pending');
  });

  it('edits the one memory ten times over and never adds a second (SC-005)', async () => {
    // Counted in the table, which is the only place the claim means anything: the service
    // suite's fake repository cannot insert a row at all, so "one memory" is structurally true
    // there and could not fail.
    const entry = await heldByTheServer();

    for (let n = 1; n <= 10; n += 1) {
      await JournalRepository.update(entry.localId, {
        contentBlocks: [{ type: 'text', content: `the quay at dusk, take ${n}`, order: 0 }],
      });
    }

    expect(__rawDb().prepare('SELECT COUNT(*) AS n FROM journal_entries').get().n).toBe(1);
    expect(JSON.parse(storedRow(entry.localId).content_blocks)[0].content).toBe(
      'the quay at dusk, take 10',
    );
  });

  it('queues one UPDATE_ENTRY per edit, not one per edit plus a stray', async () => {
    // Two edits are two operations by design (the queue does not deduplicate), and the point
    // here is the ratio: an edit adds exactly one row.
    const entry = await heldByTheServer();

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });
    await JournalRepository.update(entry.localId, { visibility: 'friends' });

    expect(queueRows().map((row) => row.operation_type)).toEqual([
      SyncOperationType.UPDATE_ENTRY,
      SyncOperationType.UPDATE_ENTRY,
    ]);
  });
});

describe('update, while storage is Local Only', () => {
  it('queues nothing and leaves the sync status alone, even for a memory the server holds', async () => {
    // Nothing drains the queue in this mode, so an operation written here could never be sent,
    // and `pending` on the row would claim a send that is not coming. `_enqueueSync` returns
    // early for exactly that reason, and the post-write correction has to hold the same rule --
    // a memory synced before the person switched cloud sync off is the one row that can still
    // read SYNCED here, which is precisely what that correction keys on.
    const entry = await heldByTheServer();
    SettingsService.isSyncEnabled.mockResolvedValue(false);

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(queueRows()).toEqual([]);
    expect(storedRow(entry.localId).sync_status).toBe('synced');
    // The edit itself is stored either way: local journaling never depends on sync.
    expect(JSON.parse(storedRow(entry.localId).content_blocks)).toEqual(EDITED);
  });
});

/**
 * When the push lands while the edit is being saved (fix round 1, Critical).
 *
 * `update` reads the entry, awaits two writes, and reads it back. A create finishing inside
 * those awaits calls `SyncEngine._handleCreateSuccess` -> `JournalRepository.markSynced`, which
 * stamps the server id and marks the row synced through its own direct write and enqueues
 * nothing. Decide anything from the read taken before that and it is decided from a row that no
 * longer exists: the memory now HAS a server id, and an edit that queued nothing on the strength
 * of the stale read is an edit no push will ever collect. Nothing heals it -- over `src/sync`
 * only `_backfillMediaQueue` and `reconcileDefaultJournal` re-enqueue anything, and neither
 * looks for a dirty row with an empty queue -- so the edit comes back only if the person happens
 * to edit the memory again.
 *
 * It is also the one window in which the old unconditional enqueue did better: the row it wrote
 * carried `server_id: null`, and `_processSingleOperation` resolves
 * `operation.serverId || currentEntry?.serverId` (`SyncEngine.js:1065`), so it would have found
 * the fresh id and sent a real update. Both decisions are therefore made from the read taken
 * AFTER the write.
 */
describe('update, when the push lands while the edit is being saved', () => {
  /**
   * The create coming back inside `update`'s own awaits: `markSynced` runs, and then the edit's
   * write proceeds. Hooked onto the first `DatabaseService.updateEntry` call, which is the
   * edit's own write, so the stamp lands after `update` has read the row and before it reads it
   * back. `markSynced`'s nested write goes to the real method: the one-shot implementation is
   * already spent, and a `jest.spyOn` with none left calls through.
   */
  const pushLandsMidSave = (localId, serverId) => {
    const realUpdateEntry = DatabaseService.updateEntry.bind(DatabaseService);
    jest
      .spyOn(DatabaseService, 'updateEntry')
      .mockImplementationOnce(async (id, data) => {
        await JournalRepository.markSynced(localId, serverId);
        return realUpdateEntry(id, data);
      });
  };

  /** A memory saved offline whose create has just been pushed, so the queue holds its done row. */
  const createJustPushed = async () => {
    const entry = await savedOnThisPhone();
    const [create] = await SyncQueue.getOperationsForEntity(entry.localId);
    await SyncQueue.markCompleted(create.id, { serverId: 'srv-late' });
    return entry;
  };

  it('queues one UPDATE_ENTRY carrying the id that landed, rather than queueing nothing', async () => {
    const entry = await createJustPushed();
    pushLandsMidSave(entry.localId, 'srv-late');

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(queueRows()).toEqual([
      expect.objectContaining({
        operation_type: SyncOperationType.CREATE_ENTRY,
        status: 'completed',
      }),
      expect.objectContaining({
        operation_type: SyncOperationType.UPDATE_ENTRY,
        entity_id: entry.localId,
        server_id: 'srv-late',
        status: 'pending',
      }),
    ]);
    // The column and the payload agree on which memory this is. They were read from different
    // snapshots before this fix.
    expect(JSON.parse(queueRows()[1].payload)).toEqual(
      expect.objectContaining({ serverId: 'srv-late', contentBlocks: EDITED }),
    );
  });

  it('leaves the row pending, so an unsent edit is not hidden behind a synced row', async () => {
    // `markSynced` wrote `synced` after `update` had read `pending`, so nothing in the edit's
    // own write moved it back -- and a row reading `synced` over an edit the server has not seen
    // is what tells `ConflictResolver.detectConflict` there is nothing local to protect, so an
    // incoming server copy overwrites the edit without a conflict being raised at all.
    const entry = await createJustPushed();
    pushLandsMidSave(entry.localId, 'srv-late');

    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    expect(storedRow(entry.localId).sync_status).toBe('pending');
    expect(storedRow(entry.localId).server_id).toBe('srv-late');
  });
});

/**
 * `JournalService.reshareEntry` over the real repository and the real queue (round-5 U3).
 *
 * Its own tests mock both, so they prove it asks for one operation; these prove one row
 * exists. The two arms were once asymmetric -- one queued here, one leaned on
 * `JournalRepository.update` -- and `update`'s unconditional `UPDATE_ENTRY` was the second
 * row that arm could leave behind.
 */
describe('reshareEntry, over the real repository', () => {
  it('leaves exactly one queued operation for a memory the server has never held: a CREATE', async () => {
    const entry = await savedOnThisPhone();
    const [create] = await SyncQueue.getOperationsForEntity(entry.localId);
    await SyncQueue.removeOperation(create.id);
    await JournalRepository.setShareState(entry.localId, ShareState.REFUSED);
    // An edit made while it was refused: this is the content the create has to carry.
    await JournalRepository.update(entry.localId, { contentBlocks: EDITED });

    await JournalService.reshareEntry(entry.localId, 'friends');

    expect(queueRows()).toEqual([
      expect.objectContaining({
        operation_type: SyncOperationType.CREATE_ENTRY,
        entity_id: entry.localId,
        server_id: null,
        status: 'pending',
      }),
    ]);
    expect(JSON.parse(queueRows()[0].payload)).toEqual(
      expect.objectContaining({ contentBlocks: EDITED, visibility: 'friends' }),
    );
    expect(storedRow(entry.localId).visibility).toBe('friends');
    expect(storedRow(entry.localId).share_state).toBeNull();
  });

  it('leaves exactly one queued operation for a memory the server holds: an UPDATE', async () => {
    const entry = await heldByTheServer();
    await JournalRepository.setShareState(entry.localId, ShareState.REFUSED);

    await JournalService.reshareEntry(entry.localId, 'friends');

    expect(queueRows()).toEqual([
      expect.objectContaining({
        operation_type: SyncOperationType.UPDATE_ENTRY,
        entity_id: entry.localId,
        server_id: 'srv-1',
        status: 'pending',
      }),
    ]);
    expect(storedRow(entry.localId).visibility).toBe('friends');
    expect(storedRow(entry.localId).share_state).toBeNull();
  });
});

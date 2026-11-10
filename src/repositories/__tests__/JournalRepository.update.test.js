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

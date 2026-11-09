/**
 * The two columns schema v8 added have to be written, read back, and spelled the same way
 * everywhere above SQLite.
 *
 * `share_state` and `server_updated_at` exist on `journal_entries` since T014/T015, and a
 * column that is written and never mapped -- or mapped and never written -- is this codebase's
 * most repeated failure: `date_precision` was stored from v5 and never read back, so every
 * "sometime in 1998" came back out as 1 January, and `location_sharing` had no column at all
 * while a privacy control appeared to work. Both were silent for months.
 *
 * So these drive the real repository over a real SQLite engine running production's own schema
 * (`expo-sqlite` is native and cannot load under jest, so the connection is Node's SQLite) and
 * check the round trip rather than the intent:
 *
 *   - `server_updated_at` holds the server's own `updatedAt` from the last server copy
 *     received -- `createFromServer` on a pull, `applyServerUpdate` on a merge. It is the
 *     reference the read-time piece-ordering rule compares a capture moment against (FR-029,
 *     research R2), so a NULL means "no threshold" and a wrong value silently reorders a
 *     person's day. The local `updated_at` is a different fact and cannot stand in for it: it
 *     is when this phone last touched the row.
 *   - `share_state` is the only record of what the server last said about a chosen audience,
 *     and `setShareState` is the one way it is written (research R15).
 *   - Both reach the app as **`serverUpdatedAt`** and **`shareState`**, camelCase, as
 *     `DatabaseService` already maps `serverId` and `syncStatus` (round-3 M1). The push path
 *     reads rows back through that mapping, so a missing map is also a value that never
 *     reaches the wire.
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

// The queue is mocked here deliberately: these tests are about what is stored, and what must
// NOT be queued. Recording the calls is the only way to assert the second half.
const mockQueue = { enqueue: jest.fn(async () => 'op-1') };

jest.mock('../../sync/SyncQueue', () => ({
  SyncQueue: mockQueue,
  SyncOperationType: {
    CREATE_ENTRY: 'create_entry',
    UPDATE_ENTRY: 'update_entry',
    DELETE_ENTRY: 'delete_entry',
  },
}));

const { __freshDatabase, __rawDb } = require('../../database');
const { JournalRepository } = require('../JournalRepository');
const { DatabaseService } = require('../../services/DatabaseService');
// The other writer of `server_updated_at`: accepting the server's version of a conflicted
// memory is a server copy arriving, exactly as a pull is.
const { ConflictResolver, ConflictType } = require('../../sync/ConflictResolver');

const SERVER_UPDATED_AT = '2026-11-08T17:42:09.123Z';

/** A server copy of a memory, as `JournalApi` hands one to the repository. */
const serverEntry = (overrides = {}) => ({
  id: 'srv-1',
  journalId: 'journal-1',
  userId: 'user-1',
  date: '2026-11-08',
  contentBlocks: [{ type: 'text', content: 'The lake, late on', order: 0 }],
  visibility: 'family',
  locationSharing: 'family',
  datePrecision: 'day',
  createdAt: '2026-11-08T09:00:00.000Z',
  updatedAt: SERVER_UPDATED_AT,
  ...overrides,
});

const storedRow = (localId) =>
  __rawDb().prepare('SELECT * FROM journal_entries WHERE local_id = ?').get(localId);

beforeEach(async () => {
  __freshDatabase();
  await DatabaseService.initialize();
  jest.clearAllMocks();
});

describe('server_updated_at, from the server copies that carry it', () => {
  it('createFromServer stores the server\'s own updatedAt', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());

    expect(storedRow(entry.localId).server_updated_at).toBe(SERVER_UPDATED_AT);
  });

  it('keeps it as the exact ISO-8601 string the server sent, not a local timestamp', async () => {
    // Stored as given. Reparsing it, or substituting the phone's own clock, is what turns the
    // ordering reference into a comparison against nothing in particular.
    const entry = await JournalRepository.createFromServer(serverEntry());
    const row = storedRow(entry.localId);

    expect(row.server_updated_at).toBe(SERVER_UPDATED_AT);
    // The local updated_at is a different fact -- when this phone last wrote the row -- and
    // is a millisecond epoch, not the server's string. The two must not be conflated.
    expect(row.updated_at).not.toBe(SERVER_UPDATED_AT);
    expect(typeof row.updated_at).toBe('number');
  });

  it('leaves it NULL when the server copy carries no updatedAt, which means no threshold', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry({ updatedAt: undefined }));

    expect(storedRow(entry.localId).server_updated_at).toBeNull();
  });

  it('applyServerUpdate stores the updatedAt of the copy it applied', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry({ updatedAt: undefined }));

    await JournalRepository.applyServerUpdate(entry.localId, {
      contentBlocks: [{ type: 'text', content: 'edited elsewhere', order: 0 }],
      visibility: 'family',
      updatedAt: SERVER_UPDATED_AT,
    });

    expect(storedRow(entry.localId).server_updated_at).toBe(SERVER_UPDATED_AT);
  });

  it('applyServerUpdate leaves a stored value alone when the copy carries no updatedAt', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());

    await JournalRepository.applyServerUpdate(entry.localId, {
      contentBlocks: [{ type: 'text', content: 'edited elsewhere', order: 0 }],
    });

    expect(storedRow(entry.localId).server_updated_at).toBe(SERVER_UPDATED_AT);
  });
});

describe('accepting the server copy of a conflicted memory (fix round 1)', () => {
  /**
   * `ConflictResolver._acceptServerVersion` is the third place a server copy lands locally,
   * alongside the pull's `createFromServer` and `applyServerUpdate`. It applied the server's
   * blocks and visibility and passed no `updatedAt`, so the row kept whatever
   * `server_updated_at` it had from before the conflict -- which for a memory edited on
   * another device is always EARLIER than the copy just accepted. FR-029's threshold then
   * sits too early and drops genuine capture moments from the ordering. (It can never sit too
   * late, so nothing is ever mis-shown; it is a lost fact, not a wrong one.)
   */
  const LATER = '2026-11-09T08:15:00.000Z';

  /** A conflict of the shape `detectConflict` builds, server copy newer than the local edit. */
  const conflictWithServerNewer = (entry, serverOverrides = {}) => ({
    type: ConflictType.UPDATE_UPDATE,
    localEntry: entry,
    serverEntry: serverEntry({ updatedAt: LATER, ...serverOverrides }),
    localModified: '2026-11-08T18:00:00.000Z',
    serverModified: LATER,
  });

  it("stores the accepted copy's updatedAt as the new ordering reference", async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());
    expect(storedRow(entry.localId).server_updated_at).toBe(SERVER_UPDATED_AT);

    const resolution = await ConflictResolver.resolveConflict(conflictWithServerNewer(entry));

    expect(resolution.action).toBe('accept_server');
    expect(storedRow(entry.localId).server_updated_at).toBe(LATER);
  });

  it('leaves the stored reference alone when the accepted copy carries no updatedAt', async () => {
    // A partial copy must not erase a threshold that is still valid, and must never replace
    // it with this phone's clock.
    const entry = await JournalRepository.createFromServer(serverEntry());

    await ConflictResolver.resolveConflict(
      conflictWithServerNewer(entry, { updatedAt: undefined }),
      'server_wins'
    );

    expect(storedRow(entry.localId).server_updated_at).toBe(SERVER_UPDATED_AT);
  });

  it('keeps it as the exact string the server sent, not the local updated_at', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());

    await ConflictResolver.resolveConflict(conflictWithServerNewer(entry), 'server_wins');

    const row = storedRow(entry.localId);
    expect(row.server_updated_at).toBe(LATER);
    expect(typeof row.updated_at).toBe('number');
  });
});

describe('share_state, the only record of what the server said about the audience', () => {
  it('setShareState writes waiting and refused', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());

    await JournalRepository.setShareState(entry.localId, 'waiting');
    expect(storedRow(entry.localId).share_state).toBe('waiting');

    await JournalRepository.setShareState(entry.localId, 'refused');
    expect(storedRow(entry.localId).share_state).toBe('refused');
  });

  it('setShareState(null) clears it, which is how choosing an audience again resets the card', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());
    await JournalRepository.setShareState(entry.localId, 'refused');

    await JournalRepository.setShareState(entry.localId, null);

    expect(storedRow(entry.localId).share_state).toBeNull();
  });

  it('markSynced clears it, because the server has now accepted the memory', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());
    await JournalRepository.setShareState(entry.localId, 'waiting');

    await JournalRepository.markSynced(entry.localId, 'srv-1');

    expect(storedRow(entry.localId).share_state).toBeNull();
  });

  it('never changes who may see the memory (FR-011, SC-010)', async () => {
    // The one failure mode with no safe side. Recording what the server said must not move
    // the audience a single step in either direction -- narrower silently withholds the
    // memory, wider shows it to somebody it was never meant for.
    const entry = await JournalRepository.createFromServer(serverEntry({ visibility: 'friends' }));
    const before = storedRow(entry.localId);

    await JournalRepository.setShareState(entry.localId, 'refused');

    const after = storedRow(entry.localId);
    expect(after.visibility).toBe('friends');
    expect(after.visibility).toBe(before.visibility);
    expect(after.location_sharing).toBe(before.location_sharing);
  });

  it('does not bump the row\'s local updated_at, which can decide a conflict (fix round 1)', async () => {
    // Recording what the server said is bookkeeping about a push that already happened, not
    // an edit the person made, and `updated_at` is what `ConflictResolver._resolveLastWriteWins`
    // compares against the server copy. Stamping it here cannot CREATE a conflict --
    // `detectConflict` keys on `syncStatus` and `syncedAt` -- but on a still-pending memory it
    // can DECIDE one already detected, tipping it toward the client and discarding a newer
    // server copy, including a narrower audience chosen on another device. That is a
    // fail-closed concern, not a cosmetic one.
    const entry = await JournalRepository.createFromServer(serverEntry());
    // Backdated explicitly: `createFromServer` and this call can land in the same millisecond,
    // which would let the assertion pass without the behaviour.
    __rawDb()
      .prepare('UPDATE journal_entries SET updated_at = ? WHERE local_id = ?')
      .run(1_000, entry.localId);

    await JournalRepository.setShareState(entry.localId, 'waiting');

    const row = storedRow(entry.localId);
    expect(row.share_state).toBe('waiting');
    expect(row.updated_at).toBe(1_000);
  });

  it('still bumps updated_at for an ordinary edit, which is a change the person made', async () => {
    // The narrow write above must not have been bought by weakening the shared write path.
    const entry = await JournalRepository.createFromServer(serverEntry());
    __rawDb()
      .prepare('UPDATE journal_entries SET updated_at = ? WHERE local_id = ?')
      .run(1_000, entry.localId);

    await DatabaseService.updateEntry(entry.localId, { visibility: 'friends' });

    expect(storedRow(entry.localId).updated_at).toBeGreaterThan(1_000);
  });

  it('never queues anything to send, because there is nothing new to tell the server', async () => {
    // Recording a refusal is bookkeeping about a push that already happened. Enqueuing here
    // would re-send a memory the server has just refused for good, which is the loop R15
    // exists to close.
    const entry = await JournalRepository.createFromServer(serverEntry());

    await JournalRepository.setShareState(entry.localId, 'refused');

    expect(mockQueue.enqueue).not.toHaveBeenCalled();
  });
});

describe('the names these reach the app under (round-3 M1)', () => {
  it('DatabaseService maps both columns into camelCase on a mapped entry', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());
    await JournalRepository.setShareState(entry.localId, 'waiting');

    const mapped = await DatabaseService.getEntryByLocalId(entry.localId);

    expect(mapped.shareState).toBe('waiting');
    expect(mapped.serverUpdatedAt).toBe(SERVER_UPDATED_AT);
  });

  it('exposes them as null, not undefined, when the row has neither', async () => {
    // A card asks "is this memory waiting to share?" and a list asks "may I use this as an
    // ordering reference?". Both need an answer that survives being read, and `undefined`
    // from a missing map looks identical to a genuinely empty column.
    const entry = await JournalRepository.createFromServer(serverEntry({ updatedAt: undefined }));

    const mapped = await DatabaseService.getEntryByLocalId(entry.localId);

    expect(mapped.shareState).toBeNull();
    expect(mapped.serverUpdatedAt).toBeNull();
    expect('shareState' in mapped).toBe(true);
    expect('serverUpdatedAt' in mapped).toBe(true);
  });

  it('carries both through the other read paths a screen uses', async () => {
    const entry = await JournalRepository.createFromServer(serverEntry());
    await JournalRepository.setShareState(entry.localId, 'refused');

    const byServerId = await DatabaseService.getEntryByServerId('srv-1');
    expect(byServerId.shareState).toBe('refused');
    expect(byServerId.serverUpdatedAt).toBe(SERVER_UPDATED_AT);

    const [listed] = await DatabaseService.getEntriesByJournalId('journal-1');
    expect(listed.shareState).toBe('refused');
    expect(listed.serverUpdatedAt).toBe(SERVER_UPDATED_AT);
  });
});

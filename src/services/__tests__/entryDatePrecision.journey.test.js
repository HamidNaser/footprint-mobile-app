/**
 * How much of a memory's date is real has to leave the phone.
 *
 * <p>
 * Somebody dating a box of scans <i>"sometime in 1998"</i> stores 1 January 1998, because a date
 * has to be some day; `date_precision` is the only thing that says the day was never supplied.
 * The column exists, a migration ships it, and `DatabaseService.insertEntry` writes it — and then
 * nothing reads it back. Neither `DatabaseService._mapEntryRow` nor `JournalRepository._mapRow`
 * mapped it, so every entry read out of SQLite came back with no precision at all.
 * </p>
 *
 * <p>
 * That is not a cosmetic loss, because the push path re-reads the row: `SyncEngine
 * ._processSingleOperation` deliberately reads through `getEntryByLocalId` rather than using the
 * queued snapshot, so the serialiser saw an entry with no precision and fell back to `'day'` every
 * single time. A memory marked <i>1998</i> was uploaded as an exact day. The detail screen reads
 * `entry.datePrecision` for the same reason and showed the invented day too.
 * </p>
 *
 * <p>
 * This drives the real hops with production code at every one: the real `insertEntry` SQL writes
 * the row, the real row mappers read it back, and the real serialiser produces the real request
 * body. Only the native modules are substituted — `expo-sqlite` is replaced by Node's own SQLite
 * running production's own `CREATE TABLE` statements, so a passing assertion means the value
 * survived rather than that a fake honoured the call it was written for.
 * </p>
 *
 * <p>
 * Deliberately behaviour rather than source text. The sibling `entryDatePrecisionSchema.test.js`
 * asserts this round trip by grepping `JournalApi.js` for a line — which stayed green for the
 * whole time the value was being discarded between SQLite and the wire, because the serialiser
 * was never the broken half. That is the technique not to copy.
 * </p>
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
  },
}));

// ---------------------------------------------------------------------------
// The local database: a real SQLite engine running production's own schema.
//
// Everything above the connection -- the CREATE TABLE statements, DatabaseService's INSERT, and
// the two row mappers under test -- is the production code, unmodified.
// ---------------------------------------------------------------------------

jest.mock('../../database', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { CREATE_TABLES, CREATE_INDEXES } = require('../../database/schema');
  const schema = require('../../database/schema');

  let db = null;

  const connection = {
    execAsync: async (sql) => db.exec(sql),
    runAsync: async (sql, params = []) => db.prepare(sql).run(...params),
    getFirstAsync: async (sql, params = []) => db.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => db.prepare(sql).all(...params),
    closeAsync: async () => db.close(),
  };

  return {
    ...schema,
    getDatabase: async () => connection,
    initializeDatabase: async () => {
      // A fresh install, built the way production builds one.
      db = new DatabaseSync(':memory:');
      for (const create of Object.values(CREATE_TABLES)) db.exec(create);
      for (const index of CREATE_INDEXES) db.exec(index);
      return connection;
    },
    clearDatabase: async () => {},
    closeDatabase: async () => {},
    getDatabaseStats: async () => ({}),
  };
});

jest.mock('../../api/ApiClient', () => ({
  ApiClient: {
    post: jest.fn().mockResolvedValue({ id: 'server-1' }),
    patch: jest.fn().mockResolvedValue({ id: 'server-1' }),
    get: jest.fn().mockResolvedValue({}),
    delete: jest.fn().mockResolvedValue({}),
  },
}));

import { DatabaseService } from '../DatabaseService';
import { JournalRepository } from '../../repositories/JournalRepository';
import { JournalApi } from '../../api/JournalApi';
import { ApiClient } from '../../api/ApiClient';

/** Every precision the holding area can produce; see src/utils/periodDate.js. */
const LEVELS = ['year', 'month', 'day'];

let counter = 0;

/**
 * Hop 1: a memory is stored, through the real INSERT, carrying the precision somebody supplied.
 * `datePrecision` omitted entirely stands for every row written before the column existed.
 */
async function store({ datePrecision } = {}) {
  const localId = `local-${++counter}`;

  await DatabaseService.insertEntry({
    localId,
    journalId: 'journal-1',
    userId: 'user-1',
    date: '1998-01-01',
    ...(datePrecision === undefined ? {} : { datePrecision }),
    contentBlocks: [{ type: 'text', content: 'the kitchen in the old house', order: 0 }],
    visibility: 'private',
  });

  return localId;
}

/** The precision the stored row actually holds, read with SQL rather than through a mapper. */
async function storedPrecision(localId) {
  const db = await DatabaseService.getDb();
  const row = await db.getFirstAsync(
    'SELECT date_precision FROM journal_entries WHERE local_id = ?',
    [localId]
  );
  return row.date_precision;
}

beforeEach(async () => {
  jest.clearAllMocks();
  ApiClient.post.mockResolvedValue({ id: 'server-1' });

  if (DatabaseService.initialized) {
    const db = await DatabaseService.getDb();
    await db.runAsync('DELETE FROM journal_entries');
  }
});

describe('a memory dated "sometime in 1998" is uploaded as 1998, not as a day', () => {
  it('reaches the upload payload with the precision it was stored with', async () => {
    // --- Hop 1: stored. The column holds what was supplied. --------------------------
    const localId = await store({ datePrecision: 'year' });
    expect(await storedPrecision(localId)).toBe('year');

    // --- Hop 2: read back out of SQLite. This is where it was lost. ------------------
    // The push path re-reads the row here rather than using the queued snapshot, so a
    // column written but never mapped cannot reach the wire at all.
    const readBack = await DatabaseService.getEntryByLocalId(localId);
    expect(readBack.datePrecision).toBe('year');

    // --- Hop 3: the real serialiser puts it on the wire. -----------------------------
    await JournalApi.createEntry(readBack);
    const [, body] = ApiClient.post.mock.calls[0];
    expect(body.datePrecision).toBe('year');

    // The day is still sent, because a date has to be some day. The precision is what
    // stops the server reading 1 January as a day somebody chose.
    expect(body.date).toBe('1998-01-01');
  });

  it('does the same for a month, so only the day is withheld', async () => {
    const localId = await store({ datePrecision: 'month' });

    const readBack = await DatabaseService.getEntryByLocalId(localId);
    await JournalApi.createEntry(readBack);

    expect(ApiClient.post.mock.calls[0][1].datePrecision).toBe('month');
  });
});

describe('an entry carrying no precision is sent exactly as it is today', () => {
  it("uploads as 'day', which is what every pre-existing row means", async () => {
    // Backward compatibility, and the reason 'day' is the right default rather than a
    // convenient one: every row written before the column existed was dated to the day.
    const localId = await store();

    // SQLite's own DEFAULT, applied to a row that said nothing.
    expect(await storedPrecision(localId)).toBe('day');

    const readBack = await DatabaseService.getEntryByLocalId(localId);
    await JournalApi.createEntry(readBack);

    expect(ApiClient.post.mock.calls[0][1].datePrecision).toBe('day');
  });

  it("falls back to 'day' even when the entry object has no precision at all", async () => {
    // The paths that never touch the local database -- an entry handed straight to the
    // serialiser -- must keep behaving as they do now.
    await JournalApi.createEntry({
      localId: 'local-direct',
      journalId: 'journal-1',
      date: '2018-07-04',
      contentBlocks: [],
      visibility: 'private',
    });

    expect(ApiClient.post.mock.calls[0][1].datePrecision).toBe('day');
  });
});

describe('the stored precision survives read-back unchanged, at every level', () => {
  it.each(LEVELS)("comes back as '%s' from DatabaseService", async (level) => {
    const localId = await store({ datePrecision: level });

    const entry = await DatabaseService.getEntryByLocalId(localId);

    expect(entry.datePrecision).toBe(level);
    // The precision says how to read the date; losing either half loses the memory's date.
    expect(entry.date).toBe('1998-01-01');
  });

  it.each(LEVELS)("comes back as '%s' from JournalRepository as well", async (level) => {
    // A second mapper reads the same rows (search, entries-with-media, date ranges). The two
    // were written apart and one being fixed is not the other being fixed.
    const localId = await store({ datePrecision: level });

    const [entry] = await JournalRepository.getByDateRange(
      '1998-01-01',
      '1998-01-01',
      'journal-1'
    );

    expect(entry.localId).toBe(localId);
    expect(entry.datePrecision).toBe(level);
  });
});

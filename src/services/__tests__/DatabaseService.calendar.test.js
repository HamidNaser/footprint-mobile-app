/**
 * 016 T003: the phone's two local calendar queries, against real engines.
 *
 * <p>
 * The Journal's feed is paged -- `useJournal` asks for 20 and asks for 20 more at the end of the
 * list -- so it can answer "the newest twenty" and nothing else. The calendar has to answer
 * "which days of March hold memories" and "every memory of March", over everything the phone
 * holds (FR-010, SC-003). That is why these two queries exist at all, and why the first test
 * here stores a hundred memories and insists on a hundred back: a query that quietly answered
 * with a page would look perfectly healthy on a journal of twelve.
 * </p>
 *
 * <p>
 * Nothing here is mocked that could hide an answer. The local database is Node's own SQLite
 * running production's own `CREATE TABLE` statements (the pattern of
 * `entryDatePrecision.journey.test.js`), so the `substr(date, 1, 10)` comparison, the
 * `GROUP BY` and the `ORDER BY` are executed by a real SQL engine rather than honoured by a
 * fake. The second backend is the **real web shim**, `src/database/index.web.js`, unmodified:
 * it understands `journal_id = ?` and nothing else -- no range, no grouping, no ordering, not
 * even `deleted_at IS NULL` -- which is the whole reason the web build computes the index and
 * the range in JS, and the reason a test that only ever ran against SQLite would prove nothing
 * about it.
 * </p>
 *
 * <p>
 * The test that matters most is the last one: the same data, read both ways, in both
 * directions, must come back as the same memories in the same order. Nothing else keeps the
 * native build and the web build from drifting into two different screens.
 * </p>
 */

/**
 * `DatabaseService` asks `Platform.OS` which build it is running in, exactly as the rest of the
 * app does. A plain object rather than the real module so a test can move between the two
 * builds; nothing in this suite's import graph needs anything else from React Native.
 */
jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// ---------------------------------------------------------------------------
// The local database, in both of its real forms. Everything above the connection -- the
// CREATE TABLE statements, DatabaseService's INSERT, the row mapper and the two queries under
// test -- is production code, unmodified.
// ---------------------------------------------------------------------------

jest.mock('../../database', () => {
  const { DatabaseSync } = require('node:sqlite');
  const schema = require('../../database/schema');
  const { CREATE_TABLES, CREATE_INDEXES } = schema;
  const web = require('../../database/index.web');

  let backend = 'sql';
  let sqlite = null;

  const sqlConnection = {
    execAsync: async (sql) => sqlite.exec(sql),
    runAsync: async (sql, params = []) => sqlite.prepare(sql).run(...params),
    getFirstAsync: async (sql, params = []) => sqlite.prepare(sql).get(...params) ?? null,
    getAllAsync: async (sql, params = []) => sqlite.prepare(sql).all(...params),
    closeAsync: async () => sqlite.close(),
  };

  return {
    ...schema,

    /** Which of the two real backends the next `initializeDatabase` hands out. */
    __useBackend: (which) => { backend = which; },

    getDatabase: async () => (backend === 'web' ? web.getDatabase() : sqlConnection),

    initializeDatabase: async () => {
      if (backend === 'web') {
        // The shim's tables live in module state, so a run starts by emptying them -- its
        // own `clearDatabase`, which is what the app calls on logout.
        await web.clearDatabase();
        return web.initializeDatabase();
      }

      // A fresh install, built the way production builds one.
      sqlite = new DatabaseSync(':memory:');
      for (const create of Object.values(CREATE_TABLES)) sqlite.exec(create);
      for (const index of CREATE_INDEXES) sqlite.exec(index);
      return sqlConnection;
    },

    clearDatabase: async () => {},
    closeDatabase: async () => {},
    getDatabaseStats: async () => ({}),
  };
});

import { DatabaseService } from '../DatabaseService';
import { buildIndex } from '../../utils/calendarModel';

const { Platform } = require('react-native');
const { __useBackend } = require('../../database');

const JOURNAL = 'journal-calendar';
const OTHER_JOURNAL = 'journal-other';
const HUNDRED = 'journal-hundred';

/**
 * The web shim narrates every insert and every select it does not understand to `console.log`.
 * Collected rather than silenced: `[WebDB] getAllAsync (unhandled)` is the shim telling us a
 * query reached it that it cannot answer, and the web path asserts that it never appears.
 */
let logged = [];

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation((...parts) => {
    logged.push(parts.map((p) => String(p)).join(' '));
  });

  // `insertEntry` stamps `updated_at` with the moment it writes. The two-backend test stores
  // the same memories twice, a millisecond or so apart, and that column would then be the one
  // difference between the two answers -- hiding nothing, but forcing the comparison to leave
  // a field out. A fixed clock lets it compare the whole entry instead.
  jest.spyOn(Date, 'now').mockReturnValue(1773792000000); // 2026-03-18T00:00:00Z
});

afterAll(() => {
  console.log.mockRestore();
  Date.now.mockRestore();
});

/**
 * Point `DatabaseService` at one of the two backends, in the build that backend belongs to, with
 * nothing stored: `initializeDatabase` builds a new in-memory database for the SQL backend and
 * empties the shim's tables for the web one, so no test can see another test's memories.
 */
async function useBackend(which) {
  __useBackend(which);
  Platform.OS = which === 'web' ? 'web' : 'ios';

  DatabaseService.initialized = false;
  DatabaseService.db = null;
  await DatabaseService.initialize();

  logged = [];
}

/** A memory, stored through the real INSERT, with a created time of its own so order is fixed. */
async function store({ localId, journalId = JOURNAL, date, datePrecision = 'day', createdAt, contentBlocks }) {
  await DatabaseService.insertEntry({
    localId,
    journalId,
    userId: 'user-1',
    date,
    datePrecision,
    createdAt,
    contentBlocks: contentBlocks || [{ type: 'text', content: localId, order: 0 }],
    visibility: 'private',
  });
}

/**
 * A memory that has been deleted, written with its `deleted_at` already set.
 *
 * Deliberately a raw INSERT rather than `insertEntry` followed by `deleteEntry`: the web shim's
 * UPDATE handler ignores the columns it is given and stamps `updated_at` alone, so the soft
 * delete would never land and the row would look alive. Naming the column in the INSERT is the
 * one way to put the same deleted row in front of both backends -- and a deleted memory
 * reappearing in a month list, or counted on a calendar day, is what this guards.
 */
async function storeDeleted({ localId, date }) {
  const db = await DatabaseService.getDb();
  await db.runAsync(
    `INSERT INTO journal_entries (
       local_id, journal_id, user_id, date, date_precision, content_blocks,
       visibility, location_sharing, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [localId, JOURNAL, 'user-1', date, 'day', '[]', 'private', 'private', 6000, 6000, 7000]
  );
}

/** A photograph as the server sends one, so the mapper's normalisation has work to do. */
const SERVER_MEDIA_BLOCK = [{
  type: 'photo',
  order: 0,
  media: [{ id: 'media-1', url: 'https://cdn/original.jpg', thumbnailUrl: 'https://cdn/thumb.jpg' }],
}];

/**
 * One journal's worth of memories covering every case the calendar has to place: two on one
 * day (one of them stored as a full ISO instant), one on another day, one known only to its
 * month, one known only to its year, one in the next month, one deleted, and one belonging to
 * somebody else's journal.
 */
async function seedFixture() {
  await store({ localId: 'e-mar-05-early', date: '2026-03-05', createdAt: 1000 });
  // A row holding a full instant, as a server pull can leave one. It is a memory of the 5th.
  await store({ localId: 'e-mar-05-late', date: '2026-03-05T23:30:00Z', createdAt: 2000 });
  await store({
    localId: 'e-mar-12',
    date: '2026-03-12',
    createdAt: 1500,
    contentBlocks: SERVER_MEDIA_BLOCK,
  });
  await store({ localId: 'e-mar-month', date: '2026-03-01', datePrecision: 'month', createdAt: 3000 });
  await store({ localId: 'e-year', date: '2026-01-01', datePrecision: 'year', createdAt: 4000 });
  await store({ localId: 'e-apr', date: '2026-04-02', createdAt: 5000 });
  await storeDeleted({ localId: 'e-deleted', date: '2026-03-20' });
  await store({ localId: 'e-other', journalId: OTHER_JOURNAL, date: '2026-03-05', createdAt: 8000 });
}

/** A hundred memories in one month -- four times what the feed would hand back in a page. */
async function seedHundred() {
  for (let i = 0; i < 100; i += 1) {
    await store({
      localId: `h-${String(i).padStart(3, '0')}`,
      journalId: HUNDRED,
      date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      createdAt: 10000 + i,
    });
  }
}

const ids = (entries) => entries.map((e) => e.localId);

/**
 * The same value with every `undefined` read as a null.
 *
 * The web shim's rows are built from the column list of the INSERT that wrote them, so a column
 * no insert names -- `synced_at`, `deleted_at` -- is simply absent, where SQLite returns it as
 * null. That is true of every query the web build has ever run and is not this task's to fix;
 * it must not be allowed to hide a real difference between the two paths, so it is normalised
 * away here and nothing else is.
 */
const nulled = (value) => JSON.parse(JSON.stringify(value, (key, v) => (v === undefined ? null : v)));

// ---------------------------------------------------------------------------

describe('getEntriesInRange reads the phone, not the feed (FR-010, SC-003)', () => {
  beforeEach(async () => {
    await useBackend('sql');
  });

  it('hands back all 100 of a month\'s memories, where the feed hands back a page', async () => {
    await seedHundred();

    const all = await DatabaseService.getEntriesInRange(
      HUNDRED, '2026-03-01', '2026-03-31', null, 'ASC'
    );

    expect(all).toHaveLength(100);
    expect(new Set(ids(all)).size).toBe(100);

    // The feed, asked the same thing, cannot answer it: this is the whole reason the query
    // exists rather than the screen filtering `allEntries`.
    const page = await DatabaseService.getEntriesByJournalId(HUNDRED);
    expect(page.length).toBeLessThan(100);
  });

  it('counts all 100 in the calendar index too, so no day is left faded', async () => {
    await seedHundred();

    const rows = await DatabaseService.getCalendarIndexRows(HUNDRED);
    const total = rows.reduce((sum, row) => sum + row.count, 0);

    expect(total).toBe(100);
    expect(buildIndex(rows).days.size).toBe(28);
  });
});

describe('getCalendarIndexRows: a day, a precision and a count, over the whole journal', () => {
  beforeEach(async () => {
    await useBackend('sql');
    await seedFixture();
  });

  it('groups by civil day and precision, oldest day first', async () => {
    const rows = await DatabaseService.getCalendarIndexRows(JOURNAL);

    expect(rows).toEqual([
      { day: '2026-01-01', date_precision: 'year', count: 1 },
      { day: '2026-03-01', date_precision: 'month', count: 1 },
      // Two memories on the 5th -- and one of them is stored as a full ISO instant (FR-011).
      { day: '2026-03-05', date_precision: 'day', count: 2 },
      { day: '2026-03-12', date_precision: 'day', count: 1 },
      { day: '2026-04-02', date_precision: 'day', count: 1 },
    ]);
  });

  it('leaves out a deleted memory and another journal\'s', async () => {
    const rows = await DatabaseService.getCalendarIndexRows(JOURNAL);

    // The deleted memory is dated 20 March; no row may mention that day at all.
    expect(rows.map((r) => r.day)).not.toContain('2026-03-20');
    // 5 March holds two of this journal's memories, not the three including the other journal's.
    expect(rows.find((r) => r.day === '2026-03-05').count).toBe(2);
  });

  it('feeds buildIndex, which marks no day for a month-only or year-only memory (FR-011)', async () => {
    const index = buildIndex(await DatabaseService.getCalendarIndexRows(JOURNAL));

    expect([...index.days.keys()].sort()).toEqual(['2026-03-05', '2026-03-12', '2026-04-02']);
    // The 1st is where a rough date is stored, and it must not read as a day with memories.
    expect(index.days.has('2026-03-01')).toBe(false);
    expect(index.days.has('2026-01-01')).toBe(false);

    // Known where it is known: the month for a month-only memory, the year for a year-only one.
    expect(index.roughMonths.get('2026-03')).toBe(1);
    expect(index.roughYears.get('2026')).toBe(1);
  });
});

describe('getEntriesInRange: the range, the precisions and the order', () => {
  beforeEach(async () => {
    await useBackend('sql');
    await seedFixture();
  });

  it('puts a row holding a full ISO instant on the day its key names (FR-011)', async () => {
    const day = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-05', '2026-03-05', null, 'DESC'
    );

    // Both ends inclusive, and `2026-03-05T23:30:00Z` is the 5th -- in every time zone.
    expect(ids(day)).toEqual(['e-mar-05-late', 'e-mar-05-early']);
  });

  it('orders a month by day and then created time, oldest first (FR-005)', async () => {
    const month = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', null, 'ASC'
    );

    expect(ids(month)).toEqual([
      'e-mar-month',     // 1 March -- where a month-only memory is stored
      'e-mar-05-early',  // the 5th, earlier created time first
      'e-mar-05-late',
      'e-mar-12',
    ]);
  });

  it('keeps a single day in the feed\'s own order, newest first (FR-004)', async () => {
    const month = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', null, 'DESC'
    );

    // Both the day and the created time reverse, so DESC is exactly ASC backwards.
    expect(ids(month)).toEqual(['e-mar-12', 'e-mar-05-late', 'e-mar-05-early', 'e-mar-month']);
  });

  it('reads anything that is not `DESC` as the calendar order, as filterRange does', async () => {
    const asked = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', null, 'ASC'
    );

    // No order at all, and a word that is not the one that matters, both mean calendar order:
    // only 'DESC' turns a list round, which is what `filterRange` says and what a screen
    // asking for a month without naming an order has to get.
    expect(ids(await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', '2026-03-31')))
      .toEqual(ids(asked));
    expect(ids(await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', '2026-03-31', null, 'oldest')))
      .toEqual(ids(asked));
    // And the one spelling that matters is read without regard to case.
    expect(ids(await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', '2026-03-31', null, 'desc')))
      .toEqual([...ids(asked)].reverse());
  });

  it('includes a rough-dated memory only where `precisions` asks for it', async () => {
    const dayOnly = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', ['day'], 'ASC'
    );
    expect(ids(dayOnly)).toEqual(['e-mar-05-early', 'e-mar-05-late', 'e-mar-12']);

    const withMonth = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', ['day', 'month'], 'ASC'
    );
    expect(ids(withMonth)).toContain('e-mar-month');

    const monthOnly = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', ['month'], 'ASC'
    );
    expect(ids(monthOnly)).toEqual(['e-mar-month']);

    // A year-only memory belongs to its year, and is reached by asking for its year.
    const yearOnly = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-01-01', '2026-12-31', ['year'], 'ASC'
    );
    expect(ids(yearOnly)).toEqual(['e-year']);
  });

  it('asked for no precision at all, answers with nothing', async () => {
    // An empty list means none, exactly as SQL's own `IN ()` would mean none -- not "every
    // precision", which is what no list at all means.
    const none = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', [], 'ASC'
    );

    expect(none).toEqual([]);
  });

  it('leaves out a deleted memory, another journal\'s, and anything outside the range', async () => {
    const month = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', null, 'ASC'
    );

    expect(ids(month)).not.toContain('e-deleted');   // 20 March, deleted
    expect(ids(month)).not.toContain('e-other');     // 5 March, another journal
    expect(ids(month)).not.toContain('e-apr');       // 2 April
    expect(ids(month)).not.toContain('e-year');      // 1 January
  });

  it('answers with nothing when it is given no range to read', async () => {
    expect(await DatabaseService.getEntriesInRange(JOURNAL, null, '2026-03-31')).toEqual([]);
    expect(await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', undefined)).toEqual([]);
  });

  it('maps a memory exactly as the feed maps it (finding F3)', async () => {
    const [viaRange] = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-12', '2026-03-12', null, 'ASC'
    );
    const viaFeed = (await DatabaseService.getEntriesByJournalId(JOURNAL, { limit: 100 }))
      .find((e) => e.localId === 'e-mar-12');

    // The same object, field for field: the card the calendar shows is the card the feed shows.
    expect(viaRange).toEqual(viaFeed);

    // And it really is the mapping that normalises server-shaped media -- the thing
    // `JournalRepository._mapRow` skips, which is why that one is not reused here.
    expect(viaRange.contentBlocks[0].media[0].thumbnailUri).toBe('https://cdn/thumb.jpg');
    expect(viaRange.contentBlocks[0].media[0].serverUrl).toBe('https://cdn/original.jpg');
    expect(viaRange.datePrecision).toBe('day');
  });
});

describe('the web build answers exactly as the SQL does (research R2, F4)', () => {
  /** Everything the two paths are asked, in one place, so neither can be asked less. */
  async function readEverything() {
    return {
      index: await DatabaseService.getCalendarIndexRows(JOURNAL),
      monthAsc: await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', '2026-03-31', null, 'ASC'),
      monthDesc: await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', '2026-03-31', null, 'DESC'),
      dayDesc: await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-05', '2026-03-05', null, 'DESC'),
      dayPrecision: await DatabaseService.getEntriesInRange(JOURNAL, '2026-03-01', '2026-03-31', ['day'], 'ASC'),
      year: await DatabaseService.getEntriesInRange(JOURNAL, '2026-01-01', '2026-12-31', ['year'], 'ASC'),
    };
  }

  it('returns the same rows in the same order, in both directions', async () => {
    await useBackend('sql');
    await seedFixture();
    const sql = await readEverything();

    await useBackend('web');
    await seedFixture();
    const webLogsFrom = logged.length;
    const web = await readEverything();

    // The shim narrates any query it cannot answer. If this fires, the web path has sent it
    // SQL it quietly ignores -- which is how a month list silently becomes the whole journal.
    expect(logged.slice(webLogsFrom).filter((line) => line.includes('unhandled'))).toEqual([]);

    expect(nulled(web.index)).toEqual(nulled(sql.index));
    Object.keys(sql).forEach((key) => {
      expect(nulled(web[key])).toEqual(nulled(sql[key]));
    });

    // Not vacuously equal: there is real data, really ordered, in both answers.
    expect(ids(sql.monthAsc)).toHaveLength(4);
    expect(ids(web.monthAsc)).toEqual(['e-mar-month', 'e-mar-05-early', 'e-mar-05-late', 'e-mar-12']);
    expect(ids(web.monthDesc)).toEqual([...ids(web.monthAsc)].reverse());
  });

  it('reads the whole journal on web too, not a page of it (FR-010)', async () => {
    await useBackend('web');
    await seedHundred();

    const all = await DatabaseService.getEntriesInRange(
      HUNDRED, '2026-03-01', '2026-03-31', null, 'ASC'
    );
    const rows = await DatabaseService.getCalendarIndexRows(HUNDRED);

    expect(all).toHaveLength(100);
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(100);
  });

  it('leaves out a deleted memory, which the shim\'s own SQL cannot', async () => {
    await useBackend('web');
    await seedFixture();

    // The shim understands `journal_id = ?` and nothing else: `deleted_at IS NULL` reaches it
    // and is ignored, so on web the deleted row is in the rows handed back and has to be
    // dropped in JS. Without that, a deleted memory returns to the month list.
    const db = await DatabaseService.getDb();
    const raw = await db.getAllAsync(
      'SELECT * FROM journal_entries WHERE journal_id = ? AND deleted_at IS NULL', [JOURNAL]
    );
    expect(raw.map((r) => r.local_id)).toContain('e-deleted');

    const month = await DatabaseService.getEntriesInRange(
      JOURNAL, '2026-03-01', '2026-03-31', null, 'ASC'
    );
    const index = await DatabaseService.getCalendarIndexRows(JOURNAL);

    expect(ids(month)).not.toContain('e-deleted');
    expect(index.map((r) => r.day)).not.toContain('2026-03-20');
  });
});

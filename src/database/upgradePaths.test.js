/**
 * @jest-environment node
 *
 * Every route a phone can take to the current schema, run through the real initializeDatabase
 * against a real SQLite engine.
 *
 * <p>
 * main shipped v6 (journal_entries.location_sharing, PR #43) while 007 was being built, and 007
 * had also called its own migration v6. A phone that installed main's build records version 6;
 * if 007's migration were still numbered 6, `getPendingMigrations(6)` would skip it and that
 * phone would never get media_queue.display_server_url or have its retired thumbnail addresses
 * cleared -- with no error anywhere. So 007's migration is v7, main's v6 is left exactly as it
 * shipped, and these tests walk each starting point to the end.
 * </p>
 *
 * <p>
 * `expo-sqlite` is native and cannot load under jest, so it is replaced with a thin adapter over
 * Node's own SQLite: the same engine and the same SQL production runs, including the exclusive
 * transaction applyMigration opens and the PRAGMA guard that keeps a fresh install from adding
 * a column CREATE_TABLES already made.
 * </p>
 *
 * <p>
 * The same guard covers a phone left part-way: v5 or v6 added its column but the app died before
 * the version was recorded (PR #47). The column is there and the version says it is not, so the
 * migration runs again and must not crash on "duplicate column".
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const SQLite = require('expo-sqlite');
const { CREATE_TABLES, SCHEMA_VERSION } = require('./schema');
const { migrations } = require('./migrations');
const { initializeDatabase, closeDatabase } = require('./index');

/** expo-sqlite's async surface, as far as the database layer uses it, over node:sqlite. */
function adapter(raw) {
  const conn = {
    raw,
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    closeAsync: async () => raw.close(),
    withExclusiveTransactionAsync: async (task) => {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await task(conn);
        raw.exec('COMMIT');
      } catch (error) {
        raw.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return conn;
}

const columns = (raw, table) => raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const versionOf = (raw) => raw.prepare('SELECT MAX(version) AS v FROM schema_version').get().v;

/** The version that added a column, found by what it does rather than by its position. */
const versionAdding = (column) =>
  migrations.find((m) => m.up.some((s) => typeof s === 'string' && new RegExp(column, 'i').test(s)))
    ?.version;

const withoutLine = (sql, pattern) => sql.replace(new RegExp(`^.*${pattern}.*$`, 'gm'), '');

/**
 * Build a database as an older build would have left it: its tables (the current ones with the
 * later columns taken back out -- derived from production, so it cannot drift from it) and the
 * schema_version rows it recorded.
 */
function installedAt(version, { dropColumns }) {
  const raw = new DatabaseSync(':memory:');
  for (const [table, sql] of Object.entries(CREATE_TABLES)) {
    let ddl = sql;
    for (const column of dropColumns[table] || []) ddl = withoutLine(ddl, `^\\s*${column}\\s`);
    raw.exec(ddl);
  }
  for (let v = 1; v <= version; v++) {
    raw.prepare('INSERT INTO schema_version (version, applied_at) VALUES (?, ?)').run(v, 1);
  }
  return raw;
}

const REMOTE_BLOCKS = JSON.stringify([
  {
    type: 'image',
    media: [
      {
        id: 'srv-1',
        serverUrl: 'https://cdn/orig',
        url: 'https://cdn/orig',
        thumbnailUrl: 'https://api/api/v1/media/t/srv-1',
        displayUrl: 'https://cdn/old-display',
      },
    ],
  },
]);

function seedEntry(raw, extra = {}) {
  const row = {
    local_id: 'e1',
    journal_id: 'j1',
    user_id: 'u1',
    date: '2018-07-04',
    content_blocks: REMOTE_BLOCKS,
    visibility: 'family',
    created_at: 1,
    updated_at: 1,
    ...extra,
  };
  const keys = Object.keys(row);
  raw
    .prepare(`INSERT INTO journal_entries (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => row[k]));
  raw
    .prepare(
      `INSERT INTO media_queue (local_id, entry_local_id, file_path, media_type, file_size,
         thumbnail_server_url, created_at) VALUES ('m1', 'e1', 'file:///a.jpg', 'image', 1, ?, 1)`
    )
    .run('https://api/api/v1/media/t/srv-1');
}

async function open(raw) {
  SQLite.openDatabaseAsync.mockResolvedValue(adapter(raw));
  await initializeDatabase();
}

afterEach(async () => {
  await closeDatabase();
});

describe('migration numbering', () => {
  it('keeps the v6 main shipped exactly as it shipped', () => {
    const v6 = migrations.filter((m) => m.version === 6);
    expect(v6).toHaveLength(1);
    expect(v6[0].up).toEqual([
      "ALTER TABLE journal_entries ADD COLUMN location_sharing TEXT NOT NULL DEFAULT 'private';",
    ]);
  });

  it('puts 007 on top of it, never into a number that has shipped', () => {
    const numbers = migrations.map((m) => m.version);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(versionAdding('display_server_url')).toBe(7);
    expect(SCHEMA_VERSION).toBe(Math.max(...numbers));
  });
});

describe('upgrade paths', () => {
  it('fresh install -> latest: every column, the latest version, no duplicate-column crash', async () => {
    const raw = new DatabaseSync(':memory:');
    await open(raw);

    expect(columns(raw, 'journal_entries')).toEqual(
      expect.arrayContaining(['date_precision', 'location_sharing'])
    );
    expect(columns(raw, 'media_queue')).toContain('display_server_url');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });

  it("main's latest (v6) -> latest: 007's migration still runs, and main's data is untouched", async () => {
    const raw = installedAt(6, { dropColumns: { media_queue: ['display_server_url'] } });
    seedEntry(raw, { location_sharing: 'family' });

    await open(raw);

    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
    expect(columns(raw, 'media_queue')).toContain('display_server_url');

    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    // The choice main's v6 stored survives 007's migration.
    expect(entry.location_sharing).toBe('family');
    expect(entry.visibility).toBe('family');
    // 007's cache clear ran: the retired addresses are gone, the original is kept.
    const [media] = JSON.parse(entry.content_blocks)[0].media;
    expect(media.thumbnailUrl).toBeUndefined();
    expect(media.displayUrl).toBeUndefined();
    expect(media.serverUrl).toBe('https://cdn/orig');
    const queued = raw.prepare("SELECT * FROM media_queue WHERE local_id = 'm1'").get();
    expect(queued.thumbnail_server_url).toBeNull();
  });

  it('pre-007 (v5) -> latest: gains both main\'s v6 and 007\'s v7, sharing nothing it did not choose', async () => {
    const raw = installedAt(5, {
      dropColumns: { journal_entries: ['location_sharing'], media_queue: ['display_server_url'] },
    });
    seedEntry(raw);

    await open(raw);

    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
    expect(columns(raw, 'journal_entries')).toContain('location_sharing');
    expect(columns(raw, 'media_queue')).toContain('display_server_url');

    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.location_sharing).toBe('private');
    expect(JSON.parse(entry.content_blocks)[0].media[0].thumbnailUrl).toBeUndefined();
  });

  it('opening an up-to-date database again changes nothing', async () => {
    const again = installedAt(SCHEMA_VERSION, { dropColumns: {} });
    seedEntry(again, { location_sharing: 'everyone' });
    await open(again);

    const entry = again.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.location_sharing).toBe('everyone');
    // Nothing re-ran: the cached addresses a current build wrote are not cleared again.
    expect(JSON.parse(entry.content_blocks)[0].media[0].thumbnailUrl).toBe(
      'https://api/api/v1/media/t/srv-1'
    );
    expect(versionOf(again)).toBe(SCHEMA_VERSION);
  });

  it('column present at schema version 4 (killed between the ALTER and the version write) completes', async () => {
    const raw = installedAt(4, {
      dropColumns: { journal_entries: ['location_sharing'], media_queue: ['display_server_url'] },
    });
    seedEntry(raw, { date_precision: 'month' });

    await open(raw);

    expect(columns(raw, 'journal_entries')).toContain('location_sharing');
    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.date_precision).toBe('month');
    expect(entry.location_sharing).toBe('private');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });

  it('v6 has the same exposure: location_sharing present at schema version 5 completes', async () => {
    const raw = installedAt(5, { dropColumns: { media_queue: ['display_server_url'] } });
    seedEntry(raw, { location_sharing: 'family' });

    await open(raw);

    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.location_sharing).toBe('family');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });
});

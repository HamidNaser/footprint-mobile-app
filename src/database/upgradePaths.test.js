/**
 * @jest-environment node
 *
 * Every route a phone can take to the current schema, run through the real initializeDatabase
 * against a real SQLite engine.
 *
 * <p>
 * A fresh install builds its tables from CREATE_TABLES -- which already declares
 * journal_entries.date_precision (v5) and journal_entries.location_sharing (v6) -- and then runs
 * every migration from version 0. Without a guard, v5's ALTER TABLE ADD COLUMN fails with
 * "duplicate column", initializeDatabase re-throws it, and the database never opens.
 * </p>
 *
 * <p>
 * `expo-sqlite` is native and cannot load under jest, so it is replaced with a thin adapter over
 * Node's own SQLite: the same engine and the same SQL production runs.
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const SQLite = require('expo-sqlite');
const { CREATE_TABLES, SCHEMA_VERSION } = require('./schema');
const { initializeDatabase, closeDatabase } = require('./index');

/** expo-sqlite's async surface, as far as the database layer uses it, over node:sqlite. */
function adapter(raw) {
  return {
    raw,
    execAsync: async (sql) => raw.exec(sql),
    runAsync: async (sql, params = []) => raw.prepare(sql).run(...params),
    getAllAsync: async (sql, params = []) => raw.prepare(sql).all(...params),
    getFirstAsync: async (sql, params = []) => raw.prepare(sql).get(...params) ?? null,
    closeAsync: async () => raw.close(),
  };
}

const columns = (raw, table) => raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
const versionOf = (raw) => raw.prepare('SELECT MAX(version) AS v FROM schema_version').get().v;

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

function seedEntry(raw, extra = {}) {
  const row = {
    local_id: 'e1',
    journal_id: 'j1',
    user_id: 'u1',
    date: '2018-07-04',
    content_blocks: '[]',
    visibility: 'family',
    created_at: 1,
    updated_at: 1,
    ...extra,
  };
  const keys = Object.keys(row);
  raw
    .prepare(`INSERT INTO journal_entries (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map((k) => row[k]));
}

async function open(raw) {
  SQLite.openDatabaseAsync.mockResolvedValue(adapter(raw));
  await initializeDatabase();
}

afterEach(async () => {
  await closeDatabase();
});

describe('upgrade paths', () => {
  it('fresh install -> latest: every column, the latest version, no duplicate-column crash', async () => {
    const raw = new DatabaseSync(':memory:');
    await open(raw);

    expect(columns(raw, 'journal_entries')).toEqual(
      expect.arrayContaining(['date_precision', 'location_sharing'])
    );
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });

  it('v4 -> latest: the migrations still add the columns a v4 phone does not have', async () => {
    const raw = installedAt(4, {
      dropColumns: { journal_entries: ['date_precision', 'location_sharing'] },
    });
    seedEntry(raw);
    expect(columns(raw, 'journal_entries')).not.toContain('date_precision');

    await open(raw);

    expect(columns(raw, 'journal_entries')).toEqual(
      expect.arrayContaining(['date_precision', 'location_sharing'])
    );
    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.date_precision).toBe('day');
    expect(entry.location_sharing).toBe('private');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });

  it('an already-migrated device opens unchanged', async () => {
    const raw = installedAt(SCHEMA_VERSION, { dropColumns: {} });
    seedEntry(raw, { date_precision: 'year', location_sharing: 'everyone' });

    await open(raw);

    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.date_precision).toBe('year');
    expect(entry.location_sharing).toBe('everyone');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });

  it('column present at schema version 4 (killed between the ALTER and the version write) completes', async () => {
    const raw = installedAt(4, { dropColumns: { journal_entries: ['location_sharing'] } });
    seedEntry(raw, { date_precision: 'month' });

    await open(raw);

    expect(columns(raw, 'journal_entries')).toContain('location_sharing');
    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.date_precision).toBe('month');
    expect(entry.location_sharing).toBe('private');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });

  it('v6 has the same exposure: location_sharing present at schema version 5 completes', async () => {
    const raw = installedAt(5, { dropColumns: {} });
    seedEntry(raw, { location_sharing: 'family' });

    await open(raw);

    const entry = raw.prepare("SELECT * FROM journal_entries WHERE local_id = 'e1'").get();
    expect(entry.location_sharing).toBe('family');
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
  });
});

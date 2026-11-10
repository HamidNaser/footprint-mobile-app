/**
 * @jest-environment node
 *
 * The local-store wipe, asserted as a **property** rather than as a list.
 *
 * <p>
 * `clearDatabase` (aliased `resetDatabase`) is what `SyncBootstrap.teardownLocalData` (sign-out)
 * and `ensureFreshLocalStore` (account switch) use so that no data bleeds across sessions. It
 * used to drop seven table names written out by hand, and `CREATE_TABLES` outgrew that list
 * twice with nothing to say so -- `photo_metadata`, and then 013's `capture_drafts`, the unsaved
 * memory. A `capture_drafts` row surviving a sign-out is a privacy hole, not an untidiness: the
 * next mount of the capture screen reads the `new` slot back, restores every piece, enables Save,
 * and saves it under the *new* user's id (FR-014: an unsaved memory stays private to the phone).
 * </p>
 *
 * <p>
 * So this file deliberately does not name any table. It reads `CREATE_TABLES`, seeds <b>every</b>
 * table in it (columns and foreign keys discovered from the real schema with `PRAGMA`), wipes,
 * and then asserts every one of them is empty. A table added tomorrow is seeded and asserted
 * without anybody editing this file -- which is the whole point, because the hand-maintained
 * list is exactly what failed.
 * </p>
 *
 * <p>
 * Run against a real SQLite engine through Node's own `node:sqlite` over the same adapter
 * `upgradePaths.test.js` uses, so the SQL asserted here -- the `DROP`s, their order under live
 * foreign keys, and the re-`CREATE` -- is the SQL production issues.
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const SQLite = require('expo-sqlite');
const { CREATE_TABLES, SCHEMA_VERSION } = require('./schema');
const { initializeDatabase, closeDatabase, clearDatabase } = require('./index');

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

const countOf = (raw, table) => raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
const versionOf = (raw) => raw.prepare('SELECT MAX(version) AS v FROM schema_version').get().v;

/**
 * One row in every table the schema defines, discovered from the schema itself.
 *
 * Columns come from `PRAGMA table_info` and foreign keys from `PRAGMA foreign_key_list`, so an
 * FK column is given the value already seeded into the table it points at -- the rows are
 * inserted with foreign keys **on**, exactly as the app runs, which is also what makes the
 * wipe's drop order meaningful. `CREATE_TABLES` is declared parents-first, so a referenced row
 * always exists by the time the child is seeded.
 *
 * @returns {Record<string, Record<string, string|number>>} the value seeded per table per column
 */
function seedEveryTable(raw) {
  const seeded = {};

  for (const table of Object.keys(CREATE_TABLES)) {
    const columns = raw.prepare(`PRAGMA table_info(${table})`).all();
    const foreignKeys = new Map(
      raw.prepare(`PRAGMA foreign_key_list(${table})`).all().map((fk) => [fk.from, fk])
    );

    const row = {};
    for (const column of columns) {
      const fk = foreignKeys.get(column.name);
      if (fk) {
        row[column.name] = seeded[fk.table][fk.to];
        continue;
      }
      // Declared type is enough: this row only has to be insertable and countable. The integer
      // is deliberately far out of range of anything the schema machinery writes for itself --
      // `schema_version` is already holding rows 1..SCHEMA_VERSION by the time this runs, and a
      // low number would collide with its primary key.
      row[column.name] = /INT|REAL|NUM/i.test(column.type || '')
        ? 90001
        : `seed-${table}-${column.name}`;
    }

    const names = Object.keys(row);
    raw
      .prepare(
        `INSERT INTO ${table} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
      )
      .run(...names.map((name) => row[name]));

    seeded[table] = row;
  }

  return seeded;
}

let raw;

beforeEach(async () => {
  raw = new DatabaseSync(':memory:');
  SQLite.openDatabaseAsync.mockResolvedValue(adapter(raw));
  await initializeDatabase();
});

afterEach(async () => {
  await closeDatabase();
});

describe('clearDatabase: the wipe is complete, for every table the schema has', () => {
  it('seeds every table in CREATE_TABLES and leaves every one of them empty', async () => {
    seedEveryTable(raw);

    // The seeding itself has to be real, or the assertion below passes for nothing.
    const before = Object.keys(CREATE_TABLES).map((table) => [table, countOf(raw, table)]);
    expect(before.filter(([, n]) => n === 0)).toEqual([]);

    await clearDatabase();

    // Named nowhere: whatever CREATE_TABLES holds is what must be empty. The next table added
    // is covered by this line without anybody remembering to add it.
    const after = Object.keys(CREATE_TABLES).map((table) => [table, countOf(raw, table)]);
    expect(after.filter(([table, n]) => n !== 0 && table !== 'schema_version')).toEqual([]);
  });

  it('keeps schema_version behaving exactly as it did: re-stamped at the current version, not wiped to 0', async () => {
    seedEveryTable(raw);
    await clearDatabase();

    // Its row is the one thing a wiped store must still have. `initializeDatabase` on the next
    // open reads this to decide which migrations to run, so a 0 here would re-run every
    // migration over tables `initializeSchema` has just created.
    expect(versionOf(raw)).toBe(SCHEMA_VERSION);
    expect(countOf(raw, 'schema_version')).toBe(1);
  });

  it('capture_drafts: an unsaved memory does not survive the wipe (013 FR-014)', async () => {
    raw
      .prepare(
        `INSERT INTO capture_drafts (id, entry_local_id, created_at, updated_at, pieces_json)
         VALUES ('new', NULL, '2026-11-10T09:00:00.000Z', '2026-11-10T09:01:00.000Z', ?)`
      )
      .run(
        JSON.stringify([
          { localId: 'p1', kind: 'text', content: 'the thing I have not saved yet' },
          { localId: 'p2', kind: 'photo', uri: 'file:///docs/capture-drafts/new/p2.jpg' },
        ])
      );
    expect(countOf(raw, 'capture_drafts')).toBe(1);

    await clearDatabase();

    expect(raw.prepare('SELECT * FROM capture_drafts').all()).toEqual([]);
  });

  it('photo_metadata: what the phone read off a photograph does not survive it either', async () => {
    seedEveryTable(raw);
    expect(countOf(raw, 'photo_metadata')).toBe(1);

    await clearDatabase();

    expect(countOf(raw, 'photo_metadata')).toBe(0);
  });

  it('leaves a usable store behind: every table exists and is writable again', async () => {
    seedEveryTable(raw);
    await clearDatabase();

    // The wipe drops and re-creates, so "empty" must not mean "gone": the app keeps using this
    // same connection after a sign-out.
    expect(() => seedEveryTable(raw)).not.toThrow();
    expect(countOf(raw, 'capture_drafts')).toBe(1);
  });
});

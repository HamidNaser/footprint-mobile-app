/**
 * @jest-environment node
 *
 * Schema v8 (013-mobile-capture-map): the `capture_drafts` table (FR-012, FR-013, research R7),
 * and two new nullable columns on `journal_entries` -- `share_state` and `server_updated_at`
 * (FR-011, FR-029, research R15).
 *
 * <p>
 * `capture_drafts` holds the one unsaved memory per slot -- a new capture, or an edit of a saved
 * one -- so it survives the screen closing, the phone locking, a call, or the app being killed
 * (FR-012). It is never read by `SyncEngine` and never reaches the server.
 * </p>
 *
 * <p>
 * `share_state` is the only record of what the server last said about a chosen audience: no
 * `sync_queue` conflict row is written for a refusal, so without this column the fact is gone the
 * moment the in-memory state is. `server_updated_at` is the reference the read-time
 * piece-ordering rule compares a capture time against; a stored value later than it cannot be
 * true and is ignored for ordering (never for storage -- FR-029).
 * </p>
 *
 * <p>
 * The migration is the dangerous half, exactly as in `entryLocationSharingSchema.test.js`: every
 * phone in the wild is on v7, with real rows in `journal_entries`, and the one mistake with no
 * safe side is losing that data on the way to v8. So this runs the <b>real</b> migration SQL
 * against a <b>real</b> SQLite engine on a <b>real</b> pre-v8 table holding a real row, and asks
 * what survives. `expo-sqlite` is native and cannot load here, so the statements production uses
 * are executed by Node's own SQLite -- the same engine, the same SQL.
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema';
import { migrations } from './migrations';

/** The migration that adds capture_drafts, found by what it does rather than by its position. */
const adding = migrations.find((m) =>
  m.up.some((sql) => typeof sql === 'string' && /capture_drafts/i.test(sql))
);

/**
 * `journal_entries` as v7 declared it: production's own statement with the two new columns taken
 * back out. Derived from production rather than copied, so this cannot quietly stop resembling it.
 */
const PRE_V8 = CREATE_TABLES.journal_entries
  .replace(/^.*share_state.*$/gim, '')
  .replace(/^.*server_updated_at.*$/gim, '');

/** The columns a v7 build knew about, in order, so a row can be inserted the way v7 inserted it. */
const PRE_V8_COLUMNS = [
  'local_id', 'journal_id', 'user_id', 'date', 'content_blocks', 'visibility',
  'location_sharing', 'created_at', 'updated_at',
];

const insertPreV8 = (db, overrides = {}) => {
  const row = {
    local_id: 'entry-1',
    journal_id: 'j1',
    user_id: 'u1',
    date: '2018-07-04',
    content_blocks: '[]',
    visibility: 'family',
    location_sharing: 'private',
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
  const keys = PRE_V8_COLUMNS;
  db.prepare(
    `INSERT INTO journal_entries (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((k) => row[k]));
};

/** Run only the plain-SQL steps of a migration's `up` (none of this migration's steps are functions). */
const runUp = (db, migration) => {
  for (const statement of migration.up) {
    if (typeof statement === 'string' && statement.trim()) db.exec(statement);
  }
};

describe('capture_drafts', () => {
  let db;

  afterEach(() => { if (db) db.close(); db = null; });

  it('is there on a fresh install, via CREATE_TABLES', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.capture_drafts);

    db.prepare(
      `INSERT INTO capture_drafts (id, entry_local_id, created_at, updated_at, pieces_json)
       VALUES ('new', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '[]')`
    ).run();

    const [row] = db.prepare('SELECT * FROM capture_drafts').all();
    expect(row.id).toBe('new');
    expect(row.entry_local_id).toBeNull();
    expect(row.pieces_json).toBe('[]');
  });

  it('is also created by migration v8, for a database that already existed', () => {
    db = new DatabaseSync(':memory:');
    db.exec(PRE_V8);
    insertPreV8(db);

    runUp(db, adding);

    const [table] = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'capture_drafts'")
      .all();
    expect(table).toBeDefined();

    db.prepare(
      `INSERT INTO capture_drafts (id, entry_local_id, created_at, updated_at, pieces_json)
       VALUES ('edit', 'entry-1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '[]')`
    ).run();
    const row = db.prepare("SELECT * FROM capture_drafts WHERE id = 'edit'").get();
    expect(row.entry_local_id).toBe('entry-1');
  });

  it('holds at most one row per slot: id is the primary key (FR-013)', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.capture_drafts);
    db.prepare(
      `INSERT INTO capture_drafts (id, created_at, updated_at, pieces_json)
       VALUES ('new', 't1', 't1', '[]')`
    ).run();

    expect(() =>
      db
        .prepare(
          `INSERT INTO capture_drafts (id, created_at, updated_at, pieces_json)
           VALUES ('new', 't2', 't2', '[]')`
        )
        .run()
    ).toThrow(/UNIQUE constraint/i);
  });

  it('requires created_at, updated_at and pieces_json, but entry_local_id is optional (NULL for \'new\')', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.capture_drafts);

    expect(() =>
      db
        .prepare(`INSERT INTO capture_drafts (id, updated_at, pieces_json) VALUES ('new', 't', '[]')`)
        .run()
    ).toThrow(/NOT NULL/i);

    expect(() =>
      db
        .prepare(
          `INSERT INTO capture_drafts (id, entry_local_id, created_at, updated_at, pieces_json)
           VALUES ('new', NULL, 't', 't', '[]')`
        )
        .run()
    ).not.toThrow();
  });
});

describe('journal_entries.share_state and journal_entries.server_updated_at', () => {
  let db;

  afterEach(() => { if (db) db.close(); db = null; });

  it('are there on a fresh install, nullable with no default', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.journal_entries);

    db.prepare(
      `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks, created_at, updated_at)
       VALUES ('e1', 'j1', 'u1', '2026-01-01', '[]', 1, 1)`
    ).run();

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.share_state).toBeNull();
    expect(row.server_updated_at).toBeNull();
  });

  it('reach a database that already existed, not only a fresh install, and leave existing rows nullable', () => {
    db = new DatabaseSync(':memory:');
    db.exec(PRE_V8);
    insertPreV8(db);

    runUp(db, adding);

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.share_state).toBeNull();
    expect(row.server_updated_at).toBeNull();
  });

  it('can hold the two share_state values the server can produce (research R15)', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.journal_entries);

    for (const state of ['waiting', 'refused']) {
      db.prepare(
        `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks, share_state, created_at, updated_at)
         VALUES (?, 'j1', 'u1', '2026-01-01', '[]', ?, 1, 1)`
      ).run(`e-${state}`, state);
    }

    const states = db
      .prepare('SELECT share_state FROM journal_entries ORDER BY local_id')
      .all()
      .map((r) => r.share_state);
    expect(states.sort()).toEqual(['refused', 'waiting']);
  });

  it('keeps a stored server_updated_at as the exact ISO-8601 string it was given', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.journal_entries);

    db.prepare(
      `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks, server_updated_at, created_at, updated_at)
       VALUES ('e1', 'j1', 'u1', '2026-01-01', '[]', '2026-02-03T04:05:06.000Z', 1, 1)`
    ).run();

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.server_updated_at).toBe('2026-02-03T04:05:06.000Z');
  });

  it('a v7 database upgrades with its data intact', () => {
    db = new DatabaseSync(':memory:');
    db.exec(PRE_V8);
    insertPreV8(db, { local_id: 'entry-1', visibility: 'family', location_sharing: 'family' });

    runUp(db, adding);

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.local_id).toBe('entry-1');
    expect(row.date).toBe('2018-07-04');
    expect(row.visibility).toBe('family');
    expect(row.location_sharing).toBe('family');
    expect(row.content_blocks).toBe('[]');
  });

  it('moves the schema version on, so the migration actually runs', () => {
    expect(adding.version).toBe(8);
    expect(adding.version).toBeLessThanOrEqual(SCHEMA_VERSION);
    expect(Math.max(...migrations.map((m) => m.version))).toBe(SCHEMA_VERSION);
  });
});

/**
 * @jest-environment node
 *
 * Who may see a memory's exact coordinates, kept per memory (schema v6).
 *
 * <p>
 * The compose screen has offered <i>Only Me / Family / Everyone</i> for each memory's location
 * since it shipped, and `journal_entries` had nowhere to put the answer. The choice was dropped
 * before it reached the database, so the server never heard it and applied the account-wide
 * default instead — meaning somebody who set that default to Everyone and then marked one
 * sensitive memory Only Me shared its exact spot with everyone who could already see it.
 * </p>
 *
 * <p>
 * The migration is the dangerous half. Every phone in the wild is on v5 with rows that carry no
 * answer, and the one mistake with no safe side would be to fill those rows in with something
 * wider than the person chose. So this runs the <b>real</b> migration SQL against a <b>real</b>
 * SQLite engine on a <b>real</b> pre-v6 table holding a real row, and asks what that row says
 * afterwards. `expo-sqlite` is native and cannot load here, so the statements production uses
 * are executed by Node's own SQLite — the same engine, the same SQL.
 * </p>
 *
 * <p>
 * Deliberately behaviour rather than source text. The sibling `entryDatePrecisionSchema.test.js`
 * asserts its round trip by grepping the source for a line, which stays green while the value is
 * discarded on the way to the server — which is the defect this file exists because of.
 * </p>
 */

import { DatabaseSync } from 'node:sqlite';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema';
import { migrations } from './migrations';

/** The migration that adds the column, found by what it does rather than by its position. */
const adding = migrations.find((m) => m.up.some((sql) => /location_sharing/i.test(sql)));

/**
 * `journal_entries` as v5 declared it: production's own statement with the new column taken back
 * out. Derived from production rather than copied, so this cannot quietly stop resembling it.
 */
const PRE_V6 = CREATE_TABLES.journal_entries
  .replace(/^.*location_sharing.*$/gm, '')
  .replace(/^\s*--.*location.*spot.*$/gim, '');

/** The columns a v5 build knew about, in order, so a row can be inserted the way v5 inserted it. */
const PRE_V6_COLUMNS = [
  'local_id', 'journal_id', 'user_id', 'date', 'content_blocks', 'visibility',
  'created_at', 'updated_at',
];

const insertPreV6 = (db, visibility) =>
  db
    .prepare(
      `INSERT INTO journal_entries (${PRE_V6_COLUMNS.join(', ')})
       VALUES (${PRE_V6_COLUMNS.map(() => '?').join(', ')})`
    )
    .run('entry-1', 'j1', 'u1', '2018-07-04', '[]', visibility, 1, 1);

describe('journal_entries.location_sharing', () => {
  let db;

  afterEach(() => { if (db) db.close(); db = null; });

  it('is there on a fresh install, defaulting to Only Me', () => {
    // The level the picker shows. An install that defaulted to anything wider would share a
    // position the person never agreed to share.
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.journal_entries);

    db.prepare(
      `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks, created_at, updated_at)
       VALUES ('e1', 'j1', 'u1', '2026-01-01', '[]', 1, 1)`
    ).run();

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.location_sharing).toBe('private');
  });

  it('reaches a database that already existed, not only a fresh install', () => {
    // A column declared only in CREATE_TABLES reaches fresh installs and nobody else — the trap
    // v4 and v5 were both written to avoid.
    db = new DatabaseSync(':memory:');
    db.exec(PRE_V6);
    insertPreV6(db, 'family');

    for (const statement of adding.up) db.exec(statement);

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.location_sharing).toBe('private');
  });

  it('widens nothing: a row that predates the column shares its exact spot with nobody', () => {
    // The rule. A memory already visible to family, or to everybody, must not have its exact
    // coordinates opened up by a schema change nobody asked for. Whatever the audience for the
    // memory was, the audience for its precise position starts at Only Me.
    db = new DatabaseSync(':memory:');
    db.exec(PRE_V6);
    for (const visibility of ['private', 'family', 'friends', 'family_friends', 'public']) {
      db.prepare(
        `INSERT INTO journal_entries (${PRE_V6_COLUMNS.join(', ')})
         VALUES (${PRE_V6_COLUMNS.map(() => '?').join(', ')})`
      ).run(`entry-${visibility}`, 'j1', 'u1', '2018-07-04', '[]', visibility, 1, 1);
    }

    for (const statement of adding.up) db.exec(statement);

    const levels = db
      .prepare('SELECT DISTINCT location_sharing FROM journal_entries')
      .all()
      .map((r) => r.location_sharing);

    expect(levels).toEqual(['private']);
  });

  it('backfills nothing, because the default is already the safe answer', () => {
    // SQLite applies the DEFAULT to rows that are already there, so an UPDATE would be either a
    // no-op dressed up as work or — far worse — the place somebody later writes the account
    // default in. Neither belongs here.
    expect(adding.up.join('\n')).not.toMatch(/UPDATE\s+journal_entries/i);
  });

  it('cannot hold "no answer", so nothing downstream has to guess', () => {
    // NOT NULL on purpose. A nullable column would leave every reader deciding for itself what
    // a missing level means, and the readers that guessed wrong would be the ones that shared
    // too much.
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.journal_entries);

    expect(() =>
      db.prepare(
        `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks, location_sharing, created_at, updated_at)
         VALUES ('e1', 'j1', 'u1', '2026-01-01', '[]', NULL, 1, 1)`
      ).run()
    ).toThrow(/NOT NULL/i);
  });

  it('keeps a level that was chosen, rather than forcing the default on everything', () => {
    db = new DatabaseSync(':memory:');
    db.exec(CREATE_TABLES.journal_entries);

    db.prepare(
      `INSERT INTO journal_entries (local_id, journal_id, user_id, date, content_blocks, location_sharing, created_at, updated_at)
       VALUES ('e1', 'j1', 'u1', '2026-01-01', '[]', 'everyone', 1, 1)`
    ).run();

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.location_sharing).toBe('everyone');
  });

  it('moves the schema version on, so the migration actually runs', () => {
    // A migration that is not the latest version never executes: initializeDatabase only runs
    // what is above the version the database records.
    expect(adding.version).toBe(SCHEMA_VERSION);
    expect(Math.max(...migrations.map((m) => m.version))).toBe(SCHEMA_VERSION);
  });

  it('leaves the rest of the row alone', () => {
    // An additive column. Anything else here would be touching data this change has no business
    // touching — not least `visibility`, which decides a different question.
    db = new DatabaseSync(':memory:');
    db.exec(PRE_V6);
    insertPreV6(db, 'family');

    for (const statement of adding.up) db.exec(statement);

    const [row] = db.prepare('SELECT * FROM journal_entries').all();
    expect(row.visibility).toBe('family');
    expect(row.date).toBe('2018-07-04');
    expect(row.local_id).toBe('entry-1');
  });
});

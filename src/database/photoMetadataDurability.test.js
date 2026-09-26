/**
 * @jest-environment node
 *
 * Metadata captured offline must survive the app being killed (T028, research.md #13).
 *
 * The scenario: photographs taken in a field with no signal, the OS reclaiming the app's
 * memory, and the upload happening days later. Everything the file knew was read at capture
 * time; if it lived only in memory it is gone, and the photograph arrives carrying none of
 * it — for exactly the photographs that are hardest to take again.
 *
 * This runs the **real** SQL against a **real** SQLite engine and a **real** file, closing
 * and reopening it between writes, because that is the only way "survives a restart" means
 * anything. A fake that honours the statements it was written for would be asserting on
 * itself. `expo-sqlite` is a native module and cannot load here, so the statements are read
 * out of the source that production uses and executed by Node's own SQLite — the same
 * engine, the same SQL.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations';

const serviceSource = fs.readFileSync(
  path.join(__dirname, '../services/DatabaseService.js'),
  'utf8'
);

/** The statement production uses, so this test breaks if the two drift apart. */
function statementFrom(pattern) {
  const match = serviceSource.match(pattern);
  if (!match) throw new Error(`Could not find the statement matching ${pattern}`);
  return match[0].replace(/`/g, '').trim();
}

const CREATE = migrations.find((m) => m.version === 4).up;
const INSERT = statementFrom(/INSERT OR REPLACE INTO photo_metadata[\s\S]*?VALUES \([^)]*\)/);
const CONFIRM = statementFrom(/UPDATE photo_metadata SET confirmed_at[^`']*/);
const PURGE = statementFrom(/DELETE FROM photo_metadata[^`']*/);

const ROW = [
  'media-1', 'media-1', 'hash-1', 'live_capture',
  '2018-07-04T15:22:00', 'exif.DateTimeOriginal', 1, -240,
  43.65, -79.38, 334.0, 'exif_gps', 1,
  'Apple', 'iPhone 15', null, 1, 'IMG_4032.HEIC',
  '{"Make":"Apple"}', Date.now(),
];

describe('photo_metadata durability', () => {
  let file;

  const open = () => {
    const db = new DatabaseSync(file);
    for (const statement of CREATE) db.exec(statement);
    return db;
  };

  beforeEach(() => {
    file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fp-db-')), 'footprint.db');
  });

  const rows = (db) => db.prepare('SELECT * FROM photo_metadata').all();

  it('keeps what was captured across a restart', () => {
    // Written on the phone in the field...
    const first = open();
    first.prepare(INSERT).run(...ROW);
    first.close();

    // ...the app is killed, and days later it opens again.
    const second = open();
    const stored = rows(second);

    expect(stored).toHaveLength(1);
    expect(stored[0].taken_at_local).toBe('2018-07-04T15:22:00');
    expect(stored[0].raw_lat).toBe(43.65);
    expect(stored[0].capture_route).toBe('live_capture');
    second.close();
  });

  it('is still owed to the server after that restart', () => {
    const first = open();
    first.prepare(INSERT).run(...ROW);
    first.close();

    const second = open();
    const unconfirmed = second
      .prepare('SELECT * FROM photo_metadata WHERE confirmed_at IS NULL')
      .all();

    expect(unconfirmed).toHaveLength(1);
    second.close();
  });

  it('is not thrown away before the server has it', () => {
    // The rule the whole table exists for. A purge that ran on send rather than on
    // acknowledgement would discard the only durable copy of something unreadable again.
    const db = open();
    db.prepare(INSERT).run(...ROW);

    db.prepare(PURGE).run();

    expect(rows(db)).toHaveLength(1);
    db.close();
  });

  it('is discarded once the server confirms it, and not before', () => {
    const db = open();
    db.prepare(INSERT).run(...ROW);

    db.prepare(CONFIRM).run(Date.now(), 'media-1');
    expect(rows(db)).toHaveLength(1);

    db.prepare(PURGE).run();
    expect(rows(db)).toHaveLength(0);
    db.close();
  });

  it('confirms only the photograph it was asked about', () => {
    const db = open();
    db.prepare(INSERT).run(...ROW);
    db.prepare(INSERT).run(...['media-2', 'media-2', ...ROW.slice(2)]);

    db.prepare(CONFIRM).run(Date.now(), 'media-1');
    db.prepare(PURGE).run();

    const left = rows(db);
    expect(left).toHaveLength(1);
    expect(left[0].media_local_id).toBe('media-2');
    db.close();
  });

  it('applies to a database that already existed before this version', () => {
    // Every phone in the wild is on an earlier schema. The migration has to create the
    // table on a database that is already there, not only on a fresh install.
    const existing = new DatabaseSync(file);
    existing.exec('CREATE TABLE IF NOT EXISTS journal_entries (local_id TEXT PRIMARY KEY);');
    existing.close();

    const upgraded = open();
    upgraded.prepare(INSERT).run(...ROW);

    expect(rows(upgraded)).toHaveLength(1);
    upgraded.close();
  });
});

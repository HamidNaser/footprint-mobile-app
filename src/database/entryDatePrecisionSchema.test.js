/**
 * How much of a local entry's date is real (FR-013c, schema v5).
 *
 * <p>
 * The holding area lets somebody date a box of scans "1978". That stores 1 January 1978, because
 * a date has to be some day, and the precision is the only thing that stops it being shown back
 * as a day nobody supplied.
 * </p>
 *
 * <p>
 * `journal_entries` had a `date` column and nothing else, so an entry read out of the local
 * database lost the precision the server knew. The offline path therefore told a small lie the
 * online path did not — invisible until somebody opened the app on a plane.
 * </p>
 */

import fs from 'fs';
import path from 'path';
import { CREATE_TABLES, SCHEMA_VERSION } from './schema';
import { migrations } from './migrations';

const source = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');

/** Column names declared in a CREATE TABLE statement. */
function columnsOf(sql) {
  const body = sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')'));
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^(FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK)\b/i.test(line))
    .map((line) => line.split(/\s+/)[0])
    .filter(Boolean);
}

/** The migration that adds the column, found by what it does rather than by its position. */
const adding = () => migrations.find((m) => m.up.some((sql) => /date_precision/i.test(sql)));

describe('journal_entries.date_precision', () => {
  it('is declared, so a fresh install has it', () => {
    expect(columnsOf(CREATE_TABLES.journal_entries)).toContain('date_precision');
  });

  it('defaults to a day, because that is what every existing row means', () => {
    // Not null. An absent value would leave the app guessing whether a row meant "to the day"
    // or "unknown", and those are different things. Every row written before this migration
    // was dated to the day, so that is the honest default rather than a convenient one.
    expect(CREATE_TABLES.journal_entries).toMatch(/date_precision\s+TEXT[^,]*DEFAULT\s+'day'/i);
  });

  it('ships as a migration, so an installed app gains it rather than missing it', () => {
    // Every phone in the wild is on v4. A column that appears only in CREATE_TABLES reaches
    // fresh installs and nobody else — which is the same trap v4 was written to avoid.
    const latest = migrations[migrations.length - 1];

    expect(latest.version).toBe(SCHEMA_VERSION);
    expect(latest.up.join('\n')).toMatch(/ALTER TABLE journal_entries[\s\S]*date_precision/i);
  });

  it('moves the schema version on, so the migration actually runs', () => {
    expect(SCHEMA_VERSION).toBe(5);
  });

  it('backfills nothing, because there is nothing to backfill', () => {
    // SQLite applies the DEFAULT to existing rows when a column is added, so every row that
    // was there already reads as 'day' without a separate UPDATE. Adding one would be a
    // no-op that looked like it was doing something.
    const latest = migrations[migrations.length - 1];

    expect(latest.up.join('\n')).not.toMatch(/UPDATE journal_entries/i);
  });
});

/**
 * A column nothing writes to is worse than no column: it looks like the feature is there.
 *
 * <p>
 * These are source assertions rather than behaviour, because `DatabaseService` and `JournalApi`
 * both reach `AsyncStorage` and throw the moment they load under jest. It is the same compromise
 * the `photo_metadata` tests make, for the same reason.
 * </p>
 */
describe('date_precision round trip', () => {
  it('is written when a local entry is inserted', () => {
    // Without this the column exists and every row gets the DEFAULT, so a year-precision entry
    // synced down from the server becomes 'day' locally — the exact loss the column prevents.
    const service = source('../services/DatabaseService.js');
    const insert = service.slice(service.indexOf('INSERT INTO journal_entries'));

    expect(insert.slice(0, 400)).toContain('date_precision');
  });

  it('survives the trip from a server entry into a local row', () => {
    const api = source('../api/JournalApi.js');
    const fromApi = api.slice(api.indexOf('formatEntryFromApi'));

    expect(fromApi.slice(0, 1200)).toContain('date_precision');
  });

  it('survives the trip back out of a local row', () => {
    // Read as snake_case from SQLite and camelCase from the API, which is why the mapper takes
    // both. Missing either half loses the precision on one path only, which is the kind of gap
    // that shows up months later on a plane.
    const api = source('../api/JournalApi.js');

    expect(api).toMatch(/datePrecision:\s*entry\.date_precision\s*\|\|\s*entry\.datePrecision/);
  });
});

/**
 * Metadata captured on a phone has to survive the phone being closed.
 *
 * The case this exists for: somebody takes photographs in a field with no signal, the OS
 * kills the app to reclaim memory, and the upload happens days later. Everything the file
 * knew — when it was taken, where, by what — was read at capture time and lives only in
 * memory until the upload completes. Without a durable copy the photograph arrives with
 * none of it, and FR-014 quietly does not hold for exactly the photographs hardest to
 * re-capture (research.md #13).
 *
 * So the row is written at capture and cleared **only once the server confirms** it has
 * its own. Clearing on send would lose the data to any failure between the two.
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

describe('photo_metadata table', () => {
  it('exists, because the capture is the part that cannot be redone', () => {
    expect(CREATE_TABLES.photo_metadata).toBeTruthy();
  });

  it('holds every field the upload payload carries', () => {
    // Anything missing here is silently dropped on the offline path only -- the online
    // path keeps it, so the gap is invisible until somebody imports from a field.
    const columns = columnsOf(CREATE_TABLES.photo_metadata);

    for (const column of [
      'local_id', 'media_local_id',
      'content_hash', 'capture_route',
      'taken_at_local', 'taken_at_source', 'taken_at_plausible', 'taken_at_offset_minutes',
      'raw_lat', 'raw_lng', 'altitude', 'lat_lng_source', 'lat_lng_plausible',
      'camera_make', 'camera_model', 'lens', 'orientation', 'original_file_name',
      'raw_metadata', 'created_at',
    ]) {
      expect(columns).toContain(column);
    }
  });

  it('records whether the server has confirmed it, so clearing is not guesswork', () => {
    // The whole point of the table. A row is only safe to delete once the server holds
    // the same facts; anything else trades a durable copy for a hopeful one.
    expect(columnsOf(CREATE_TABLES.photo_metadata)).toContain('confirmed_at');
  });

  it('ships with a migration, so an installed app gains the table rather than missing it', () => {
    // Every phone in the wild is on an earlier version. A table that only appears in
    // CREATE_TABLES reaches fresh installs and nobody else.
    // Found by what it does, not by being last. This asserted `migrations[length - 1]`
    // and broke the moment a v5 migration arrived for something else — the table had not
    // moved, only the end of the list had.
    const creating = migrations.find((m) => m.up.some((sql) => sql.includes('photo_metadata')));

    expect(creating).toBeTruthy();
    expect(creating.version).toBeLessThanOrEqual(SCHEMA_VERSION);
  });

  it('is written and cleared by DatabaseService, not only declared', () => {
    // A schema nothing writes to is worse than no schema: it looks like the feature is
    // there. These are the two halves -- save at capture, clear on confirmation.
    const service = source('../services/DatabaseService.js');

    expect(service).toContain('savePhotoMetadata');
    expect(service).toContain('confirmPhotoMetadata');
  });

  it('never clears a row the server has not confirmed', () => {
    // Asserted against the SQL itself. A DELETE without the confirmation predicate is the
    // one change that would quietly reintroduce the data loss this table prevents.
    const service = source('../services/DatabaseService.js');
    const deletes = service.match(/DELETE FROM photo_metadata[^`';]*/g) ?? [];

    expect(deletes.length).toBeGreaterThan(0);
    for (const statement of deletes) {
      expect(statement).toMatch(/confirmed_at IS NOT NULL/);
    }
  });
});

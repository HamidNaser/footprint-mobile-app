/**
 * The sync_queue table must contain every column its only consumer touches.
 *
 * This has now been wrong twice, in the same way both times, and it fails the same way
 * each time: the write throws "no such column", SyncQueue swallows it as a failed
 * operation, and the entry sits in the queue being retried forever while the app reports
 * everything as saved. Nothing on screen says otherwise.
 *
 * The first miss was the whole table -- schema.js created entity_type/entity_local_id and
 * SyncQueue.js writes entity_id/server_id/priority. The second was narrower and entirely
 * self-inflicted: the rebuild was derived from the INSERT statements, so the two columns
 * that appear only in UPDATEs -- `result` on success, `conflict_data` on conflict -- were
 * left out. Enqueueing worked; completing did not.
 *
 * So this reads the columns out of the SQL itself rather than trusting a list anybody
 * maintains by hand. A new column in a query with no matching column in the schema fails
 * here, at the point it is introduced, instead of on a device hours later.
 */

import fs from 'fs';
import path from 'path';
import { CREATE_TABLES } from './schema';

const syncQueueSource = fs.readFileSync(
  path.join(__dirname, '../sync/SyncQueue.js'),
  'utf8'
);

/** Column names declared in the CREATE TABLE statement. */
function schemaColumns() {
  const body = CREATE_TABLES.sync_queue.match(/\(([\s\S]*)\)/)[1];
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0])
    .filter((name) => /^[a-z_]+$/.test(name));
}

/**
 * Columns the code writes. Taken from INSERT column lists and from `name = ?` assignments
 * in UPDATE statements -- the second being exactly what the last fix overlooked.
 */
function columnsUsedInCode() {
  const used = new Set();

  for (const [, list] of syncQueueSource.matchAll(/INSERT INTO sync_queue\s*\(([^)]*)\)/g)) {
    list.split(',').map((c) => c.trim()).filter(Boolean).forEach((c) => used.add(c));
  }

  for (const [, block] of syncQueueSource.matchAll(/UPDATE sync_queue SET([\s\S]*?)WHERE/g)) {
    for (const [, name] of block.matchAll(/([a-z_]+)\s*=\s*\?/g)) used.add(name);
  }

  return [...used];
}

describe('sync_queue schema', () => {
  it('declares every column the queue writes', () => {
    const declared = schemaColumns();
    const missing = columnsUsedInCode().filter((c) => !declared.includes(c));

    expect(missing).toEqual([]);
  });

  it('found columns to check at all, so a broken parse cannot pass silently', () => {
    // Without this the regexes could quietly match nothing and the test above would
    // "pass" by comparing two empty lists.
    expect(columnsUsedInCode().length).toBeGreaterThan(8);
    expect(schemaColumns().length).toBeGreaterThan(8);
  });

  it('keeps the two columns that only ever appear in UPDATEs', () => {
    // Named explicitly because they are the ones a rebuild-from-INSERTs loses.
    expect(schemaColumns()).toEqual(expect.arrayContaining(['result', 'conflict_data']));
  });
});
